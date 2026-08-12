import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/shared/StatusBadge';
import { ClipboardList } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function CustomerOrderHistoryTable({ customerId, orders, isLoading }) {
  const navigate = useNavigate();

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> Orders</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No orders yet — place one with "+ Quick Order"</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow><TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Items</TableHead><TableHead>Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/customers/${customerId}/orders/${o.id}`)}>
                  <TableCell className="font-mono text-xs font-semibold">{o.order_number}</TableCell>
                  <TableCell className="text-muted-foreground">{o.order_date ? format(parseISO(o.order_date), 'd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-right">{o.totalUnits}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
