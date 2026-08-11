import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const CONTACT_METHODS = [
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'text', label: 'Text' },
  { value: 'social_media', label: 'Social media' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Other' },
];

const OUTCOMES = [
  { value: 'no_action', label: 'No action required' },
  { value: 'follow_up_required', label: 'Follow-up required' },
  { value: 'order_placed', label: 'Order placed' },
  { value: 'pricing_requested', label: 'Pricing requested' },
  { value: 'product_requested', label: 'Product requested' },
  { value: 'issue_raised', label: 'Issue raised' },
  { value: 'other', label: 'Other' },
];

const blankForm = () => ({
  date: new Date().toISOString().split('T')[0],
  subtype: 'phone',
  subject: '',
  notes: '',
  outcome: 'no_action',
  status: 'resolved',
  follow_up_required: false,
  follow_up_date: '',
  follow_up_task: '',
});

export default function LogContactDialog({ customer, open, onOpenChange }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankForm());
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const mutation = useMutation({
    mutationFn: () => db.CustomerActivity.create({
      customer_id: customer.id,
      type: 'contact',
      date: form.date,
      subtype: form.subtype,
      subject: form.subject || null,
      notes: form.notes || null,
      outcome: form.outcome,
      status: form.status,
      follow_up_required: form.follow_up_required,
      follow_up_date: form.follow_up_required && form.follow_up_date ? form.follow_up_date : null,
      follow_up_task: form.follow_up_required ? form.follow_up_task || null : null,
      recorded_by: user?.full_name || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerActivities'] });
      toast.success('Contact logged');
      onOpenChange(false);
      setForm(blankForm());
    },
    onError: (e) => toast.error('Failed to save: ' + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setForm(blankForm()); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Log Contact</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <p className="text-sm font-semibold">{customer.business_name}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact method</Label>
              <Select value={form.subtype} onValueChange={(v) => set('subtype', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </div>
          </div>

          <div>
            <Label>Contacted by</Label>
            <Input value={user?.full_name || ''} disabled className="bg-muted" />
          </div>

          <div>
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="e.g. Wholesale pricing request" />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={4} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Outcome</Label>
              <Select value={form.outcome} onValueChange={(v) => set('outcome', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="mb-0">Follow-up required?</Label>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant={form.follow_up_required ? 'default' : 'outline'} onClick={() => set('follow_up_required', true)}>Yes</Button>
                <Button type="button" size="sm" variant={!form.follow_up_required ? 'default' : 'outline'} onClick={() => set('follow_up_required', false)}>No</Button>
              </div>
            </div>
            {form.follow_up_required && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Follow-up date</Label>
                  <Input type="date" value={form.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Follow-up task</Label>
                  <Input value={form.follow_up_task} onChange={(e) => set('follow_up_task', e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Contact'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
