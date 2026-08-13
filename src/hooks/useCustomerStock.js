import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';

// "Current stock" per product is whatever the most recent stock check said
// it was — stock checks are append-only (never overwritten, per spec), so
// "current" always means "most recent by check_date, tie-broken by
// created_at". A product with no stock check yet has no known current
// figure (null, not 0 — 0 would falsely read as "customer has none").
function latestCheckFor(stockChecks, customerId, productId) {
  return stockChecks
    .filter((c) => c.customer_id === customerId && c.product_id === productId)
    .reduce((latest, c) => {
      if (!latest) return c;
      if (c.check_date !== latest.check_date) return c.check_date > latest.check_date ? c : latest;
      return c.created_at > latest.created_at ? c : latest;
    }, null);
}

function buildCustomerStockRow(product, customerId, { parLevels, stockChecks, orderIdsByCustomer, dispatches }) {
  const latestCheck = latestCheckFor(stockChecks, customerId, product.id);
  const parLevel = parLevels.find((p) => p.customer_id === customerId && p.product_id === product.id)?.par_level ?? 0;
  const currentStock = latestCheck ? latestCheck.quantity_bottles : null;
  const myOrderIds = orderIdsByCustomer.get(customerId) || new Set();
  const lastOrderDate = dispatches
    .filter((d) => d.order_id && myOrderIds.has(d.order_id) && d.product_name === product.name && Number(d.bottle_size_ml || 0) === Number(product.bottle_size_ml || 0))
    .reduce((latest, d) => (!latest || d.dispatch_date > latest ? d.dispatch_date : latest), null);
  const suggestedOrderQty = currentStock == null ? Math.max(0, parLevel) : Math.max(0, parLevel - currentStock);

  return {
    product,
    currentStock,
    parLevel,
    lastCheckDate: latestCheck?.check_date || null,
    lastOrderDate,
    suggestedOrderQty,
    belowPar: parLevel > 0 && currentStock != null && currentStock < parLevel,
  };
}

/** Customer Stock table + Stock History source data for one customer's profile. */
export function useCustomerStock(customerId) {
  const { data: products = [], isLoading: productsLoading } = useQuery({ queryKey: ['products'], queryFn: () => db.Product.list('sort_order', 1000) });
  const { data: parLevels = [], isLoading: parLoading } = useQuery({ queryKey: ['customerParLevels'], queryFn: () => db.CustomerParLevel.list('-updated_at', 5000) });
  const { data: stockChecks = [], isLoading: checksLoading } = useQuery({ queryKey: ['customerStockChecks'], queryFn: () => db.CustomerStockCheck.list('-check_date', 5000) });
  const { data: customerOrders = [], isLoading: ordersLoading } = useQuery({ queryKey: ['customerOrders'], queryFn: () => db.CustomerOrder.list('-order_date', 5000) });
  const { data: dispatches = [], isLoading: dispatchLoading } = useQuery({ queryKey: ['dispatches-all'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });

  const activeProducts = useMemo(() => products.filter((p) => p.active !== false), [products]);

  const orderIdsByCustomer = useMemo(() => {
    const m = new Map();
    for (const o of customerOrders) {
      if (!m.has(o.customer_id)) m.set(o.customer_id, new Set());
      m.get(o.customer_id).add(o.id);
    }
    return m;
  }, [customerOrders]);

  const rows = useMemo(() => {
    if (!customerId) return [];
    return activeProducts.map((product) =>
      buildCustomerStockRow(product, customerId, { parLevels, stockChecks, orderIdsByCustomer, dispatches })
    );
  }, [customerId, activeProducts, parLevels, stockChecks, orderIdsByCustomer, dispatches]);

  // Grouped by session_id + check_date for the Stock History timeline — one
  // entry per "+ Stock Check" submission, newest first.
  const history = useMemo(() => {
    if (!customerId) return [];
    const mine = stockChecks.filter((c) => c.customer_id === customerId);
    const bySession = new Map();
    for (const c of mine) {
      if (!bySession.has(c.session_id)) bySession.set(c.session_id, { sessionId: c.session_id, checkDate: c.check_date, recordedBy: c.recorded_by, lines: [] });
      bySession.get(c.session_id).lines.push(c);
    }
    return [...bySession.values()].sort((a, b) => (b.checkDate > a.checkDate ? 1 : b.checkDate < a.checkDate ? -1 : 0));
  }, [customerId, stockChecks]);

  return {
    products: activeProducts,
    rows,
    history,
    totalCurrentStock: rows.reduce((s, r) => s + (r.currentStock || 0), 0),
    lastStockCheckDate: history[0]?.checkDate || null,
    isLoading: productsLoading || parLoading || checksLoading || ordersLoading || dispatchLoading,
  };
}

/** Flat below-par list across every customer — for Stock Alerts + the Sales Dashboard tile. */
export function useCustomerStockAlerts() {
  const { data: customers = [], isLoading: customersLoading } = useQuery({ queryKey: ['customers'], queryFn: () => db.Customer.list('business_name', 5000) });
  const { data: products = [], isLoading: productsLoading } = useQuery({ queryKey: ['products'], queryFn: () => db.Product.list('sort_order', 1000) });
  const { data: parLevels = [], isLoading: parLoading } = useQuery({ queryKey: ['customerParLevels'], queryFn: () => db.CustomerParLevel.list('-updated_at', 5000) });
  const { data: stockChecks = [], isLoading: checksLoading } = useQuery({ queryKey: ['customerStockChecks'], queryFn: () => db.CustomerStockCheck.list('-check_date', 5000) });
  const { data: customerOrders = [], isLoading: ordersLoading } = useQuery({ queryKey: ['customerOrders'], queryFn: () => db.CustomerOrder.list('-order_date', 5000) });
  const { data: dispatches = [], isLoading: dispatchLoading } = useQuery({ queryKey: ['dispatches-all'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });

  const activeProducts = useMemo(() => products.filter((p) => p.active !== false), [products]);

  const orderIdsByCustomer = useMemo(() => {
    const m = new Map();
    for (const o of customerOrders) {
      if (!m.has(o.customer_id)) m.set(o.customer_id, new Set());
      m.get(o.customer_id).add(o.id);
    }
    return m;
  }, [customerOrders]);

  // Only bother building rows for customer+product pairs with an actual
  // par level set — most customer/product combinations will never have one,
  // and building a full customer x product cross-product would be wasteful.
  const alerts = useMemo(() => {
    const out = [];
    for (const par of parLevels) {
      if (!(par.par_level > 0)) continue;
      const customer = customers.find((c) => c.id === par.customer_id);
      const product = activeProducts.find((p) => p.id === par.product_id);
      if (!customer || !product) continue;
      const row = buildCustomerStockRow(product, customer.id, { parLevels, stockChecks, orderIdsByCustomer, dispatches });
      if (row.belowPar) out.push({ customer, ...row });
    }
    return out.sort((a, b) => (a.currentStock / a.parLevel) - (b.currentStock / b.parLevel));
  }, [parLevels, customers, activeProducts, stockChecks, orderIdsByCustomer, dispatches]);

  return {
    alerts,
    isLoading: customersLoading || productsLoading || parLoading || checksLoading || ordersLoading || dispatchLoading,
  };
}
