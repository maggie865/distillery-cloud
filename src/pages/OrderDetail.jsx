import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, supabase } from '@/api/supabaseClient';
import { useOrderDetail } from '@/hooks/useCustomerOrders';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/shared/StatusBadge';
import { ArrowLeft, Mail, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

export default function OrderDetail() {
  const { customerId, orderId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: () => db.Customer.list('business_name', 5000) });
  const customer = customersQuery.data?.find((c) => c.id === customerId);
  const { order, lines, status, totalUnits, isLoading } = useOrderDetail(orderId);

  const resendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('send-order-email', {
        body: {
          orderId: order.id,
          orderNumber: order.order_number,
          customerName: customer?.business_name,
          orderDate: order.order_date,
          orderedBy: order.ordered_by,
          lines: lines.map((l) => ({ productName: l.product_name, qty: l.quantity_bottles })),
          totalUnits,
          notes: order.notes,
        },
      });
      if (error) throw error;
      await db.CustomerOrder.update(order.id, { email_status: 'sent', email_sent_at: new Date().toISOString(), email_error: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerOrder', orderId] });
      toast.success('Order email sent');
    },
    onError: async (e) => {
      await db.CustomerOrder.update(order.id, { email_status: 'failed', email_error: e.message || String(e) });
      queryClient.invalidateQueries({ queryKey: ['customerOrder', orderId] });
      toast.error('Email failed to send — order is unaffected, try resending');
    },
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-xl font-semibold text-foreground mb-2">Order not found</h1>
        <Button onClick={() => navigate(`/customers/${customerId}`)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back to Customer</Button>
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-0">
      <button onClick={() => navigate(`/customers/${customerId}`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to {customer?.business_name || 'Customer'}
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-foreground font-mono">{order.order_number}</h1>
          <p className="text-sm text-muted-foreground mt-1">{customer?.business_name} · {order.order_date ? format(parseISO(order.order_date), 'd MMMM yyyy') : ''}{order.ordered_by ? ` · Ordered by ${order.ordered_by}` : ''}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {order.email_status === 'failed' && (
        <Card className="p-4 mb-5 border-destructive/40 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Order confirmation email failed to send</p>
              {order.email_error && <p className="text-xs text-destructive/80 mt-0.5">{order.email_error}</p>}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => resendMutation.mutate()} disabled={resendMutation.isPending}>
              <Mail className="w-3.5 h-3.5" /> {resendMutation.isPending ? 'Sending…' : 'Resend Email'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5 mb-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Order Items</h2>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.product_name}{l.bottle_size_ml ? ` (${l.bottle_size_ml}ml)` : ''}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{l.batch_number || 'Not yet assigned'}</TableCell>
                  <TableCell className="text-right font-semibold">{l.quantity_bottles}</TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={2}>Total Units</TableCell>
                <TableCell className="text-right">{totalUnits}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {order.notes && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground">{order.notes}</p>
        </Card>
      )}
    </div>
  );
}
