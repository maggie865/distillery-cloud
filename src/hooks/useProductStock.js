import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';

// A dispatch reserves its line item the moment it's created — physical
// stock isn't touched until it actually reaches 'dispatched'/'delivered'
// (see DEDUCTED_STATUSES in DispatchHub.jsx). These are the statuses that
// count as "reserved but not yet deducted".
const RESERVING_STATUSES = new Set(['pending', 'picking', 'ready']);

const productKey = (name, sizeMl) => `${name}||${sizeMl || ''}`;

function locationOf(dispatchedFrom) {
  if (dispatchedFrom === 'UK Bonded') return 'UK Bonded';
  if (dispatchedFrom === 'Auckland 3PL') return 'Auckland 3PL';
  return 'Bluff';
}

/**
 * Derived (never stored) physical / reserved / available stock per
 * (product, bottle size, location) — same "calculate, don't store"
 * convention as useRawMaterialsNetStock. `reserved` is the sum of
 * quantity_bottles across dispatch rows that haven't been dispatched yet
 * (spec: "reserve stock, don't deduct until Dispatched"); `available` is
 * what Quick Order, DispatchForm, Stock Alerts and the Sales Dashboard
 * should all be checking against — not the raw physical figure alone,
 * which would let the same stock be sold twice.
 */
export function useProductStock() {
  const { data: finishedGoods = [], isLoading: fgLoading } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => db.FinishedGood.list('-created_at', 5000),
  });
  const { data: warehouseStock = [], isLoading: wsLoading } = useQuery({
    queryKey: ['warehouseStock'],
    queryFn: () => db.WarehouseStock.list('-date_transferred_in', 5000),
  });
  const { data: dispatches = [], isLoading: dispatchLoading } = useQuery({
    queryKey: ['dispatches-all'],
    queryFn: () => db.Dispatch.list('-dispatch_date', 5000),
  });

  const map = useMemo(() => {
    const m = {};
    const ensure = (name, sizeMl) => {
      const k = productKey(name, sizeMl);
      if (!m[k]) {
        m[k] = {
          productName: name,
          bottleSizeMl: sizeMl || null,
          physical: { Bluff: 0, 'Auckland 3PL': 0, 'UK Bonded': 0 },
          reserved: { Bluff: 0, 'Auckland 3PL': 0, 'UK Bonded': 0 },
        };
      }
      return m[k];
    };

    for (const fg of finishedGoods) {
      ensure(fg.product_name, fg.bottle_size_ml).physical.Bluff += fg.quantity_bottles || 0;
    }
    for (const ws of warehouseStock) {
      if (ws.status === 'in_transit') continue; // not receivable/sellable until arrived
      const loc = locationOf(ws.warehouse_location);
      ensure(ws.product_name, ws.bottle_size_ml).physical[loc === 'Bluff' ? 'Auckland 3PL' : loc] += ws.quantity_bottles || 0;
    }
    for (const d of dispatches) {
      if (!RESERVING_STATUSES.has(d.status)) continue;
      const loc = locationOf(d.dispatched_from);
      ensure(d.product_name, d.bottle_size_ml).reserved[loc] += d.quantity_bottles || 0;
    }
    return m;
  }, [finishedGoods, warehouseStock, dispatches]);

  /** Physical / reserved / available for one product+size at one location ('Bluff' | 'Auckland 3PL' | 'UK Bonded'). */
  const getStock = (productName, bottleSizeMl, dispatchedFrom = 'Bluff') => {
    const loc = locationOf(dispatchedFrom);
    const e = map[productKey(productName, bottleSizeMl)];
    const physical = e ? e.physical[loc] : 0;
    const reserved = e ? e.reserved[loc] : 0;
    return { physical, reserved, available: Math.max(0, physical - reserved) };
  };

  /** Available Bluff stock only, the figure Customer Stock / Quick Order / Stock Alerts care about. */
  const getAvailableBluff = (productName, bottleSizeMl) => getStock(productName, bottleSizeMl, 'Bluff').available;

  return {
    getStock,
    getAvailableBluff,
    isLoading: fgLoading || wsLoading || dispatchLoading,
  };
}
