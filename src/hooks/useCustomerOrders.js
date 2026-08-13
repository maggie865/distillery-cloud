import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';

// customer_order carries no status column of its own — its status is
// always derived from the dispatch rows it created (dispatch.order_id),
// same "calculate, don't store" convention as everything else derived in
// this codebase. All-cancelled is checked before all-fulfilled so a fully
// cancelled order reads as Cancelled rather than an empty "Dispatched".
function deriveOrderStatus(lines) {
  if (lines.length === 0) return 'pending';
  const statuses = new Set(lines.map((l) => l.status));
  if ([...statuses].every((s) => s === 'cancelled')) return 'cancelled';
  const active = lines.filter((l) => l.status !== 'cancelled');
  if (active.length > 0 && active.every((l) => l.status === 'dispatched' || l.status === 'delivered')) return 'dispatched';
  if (active.some((l) => l.status === 'pending')) return 'pending';
  if (active.some((l) => l.status === 'picking')) return 'picking';
  if (active.some((l) => l.status === 'ready')) return 'ready';
  return 'processing';
}

/** One customer's order history — customer_order headers joined to their dispatch line items. */
export function useCustomerOrders(customerId) {
  const { data: customerOrders = [], isLoading: ordersLoading } = useQuery({ queryKey: ['customerOrders'], queryFn: () => db.CustomerOrder.list('-order_date', 5000) });
  const { data: dispatches = [], isLoading: dispatchLoading } = useQuery({ queryKey: ['dispatches-all'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });

  const orders = useMemo(() => {
    if (!customerId) return [];
    return customerOrders
      .filter((o) => o.customer_id === customerId)
      .map((order) => {
        const lines = dispatches.filter((d) => d.order_id === order.id);
        return {
          ...order,
          lines,
          status: deriveOrderStatus(lines),
          itemCount: lines.length,
          totalUnits: lines.reduce((s, l) => s + (l.quantity_bottles || 0), 0),
        };
      })
      .sort((a, b) => (b.order_date > a.order_date ? 1 : b.order_date < a.order_date ? -1 : 0));
  }, [customerId, customerOrders, dispatches]);

  const pendingCount = orders.filter((o) => o.status !== 'dispatched' && o.status !== 'cancelled').length;

  return { orders, pendingCount, isLoading: ordersLoading || dispatchLoading };
}

/** One order's full detail (header + line items), for the Order Detail page. */
export function useOrderDetail(orderId) {
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['customerOrder', orderId],
    queryFn: () => db.CustomerOrder.get(orderId),
    enabled: !!orderId,
  });
  const { data: dispatches = [], isLoading: dispatchLoading } = useQuery({ queryKey: ['dispatches-all'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });

  const lines = useMemo(() => (order ? dispatches.filter((d) => d.order_id === order.id) : []), [order, dispatches]);

  return {
    order,
    lines,
    status: order ? deriveOrderStatus(lines) : null,
    totalUnits: lines.reduce((s, l) => s + (l.quantity_bottles || 0), 0),
    isLoading: orderLoading || dispatchLoading,
  };
}
