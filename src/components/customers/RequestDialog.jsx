import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export const REQUEST_TYPES = [
  { value: 'pricing', label: 'Pricing' },
  { value: 'product_info', label: 'Product information' },
  { value: 'order', label: 'Order' },
  { value: 'stock', label: 'Stock' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'marketing_material', label: 'Marketing material' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'other', label: 'Other' },
];

export const REQUEST_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'resolved', label: 'Resolved' },
];

const blankForm = (customer) => ({
  customer_id: customer?.id || '',
  date_received: new Date().toISOString().split('T')[0],
  request_type: 'pricing',
  description: '',
  priority: 'normal',
  assigned_to: '',
  status: 'open',
  due_date: '',
  resolution_notes: '',
});

export default function RequestDialog({ customer, request, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankForm(customer));

  useEffect(() => {
    if (request) {
      setForm({
        customer_id: request.customer_id,
        date_received: request.date_received || new Date().toISOString().split('T')[0],
        request_type: request.request_type || 'pricing',
        description: request.description || '',
        priority: request.priority || 'normal',
        assigned_to: request.assigned_to || '',
        status: request.status || 'open',
        due_date: request.due_date || '',
        resolution_notes: request.resolution_notes || '',
      });
    } else if (customer) {
      setForm(blankForm(customer));
    }
  }, [request, customer, open]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        customer_id: form.customer_id,
        date_received: form.date_received,
        request_type: form.request_type,
        description: form.description || null,
        priority: form.priority,
        assigned_to: form.assigned_to || null,
        status: form.status,
        due_date: form.due_date || null,
        resolution_notes: form.resolution_notes || null,
        date_resolved: form.status === 'resolved' ? (request?.date_resolved || new Date().toISOString().split('T')[0]) : null,
      };
      return request ? db.CustomerRequest.update(request.id, payload) : db.CustomerRequest.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerRequests'] });
      toast.success(request ? 'Request updated' : 'Request added');
      onOpenChange(false);
    },
    onError: (e) => toast.error('Failed to save: ' + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{request ? 'Edit Request' : 'New Request'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 mt-2">
          {customer && (
            <div>
              <Label className="text-xs text-muted-foreground">Customer</Label>
              <p className="text-sm font-semibold">{customer.business_name}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date Received</Label>
              <Input type="date" value={form.date_received} onChange={(e) => set('date_received', e.target.value)} required />
            </div>
            <div>
              <Label>Request Type</Label>
              <Select value={form.request_type} onValueChange={(v) => set('request_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned to</Label>
              <Input value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REQUEST_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
            </div>
          </div>
          {form.status === 'resolved' && (
            <div>
              <Label>Resolution Notes</Label>
              <Textarea value={form.resolution_notes} onChange={(e) => set('resolution_notes', e.target.value)} rows={2} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : request ? 'Save Changes' : 'Add Request'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
