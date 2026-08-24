import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { toast } from 'sonner';

const VISIT_TYPES = [
  { value: 'new_customer_visit', label: 'New customer visit' },
  { value: 'sales_visit', label: 'Sales visit' },
  { value: 'relationship_visit', label: 'Relationship visit' },
  { value: 'stock_check', label: 'Stock check' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'product_presentation', label: 'Product presentation' },
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
  business_name: '',
  primary_contact: '',
  phone: '',
  email: '',
  date: new Date().toISOString().split('T')[0],
  time: new Date().toTimeString().slice(0, 5),
  subtype: 'new_customer_visit',
  notes: '',
  discussed_products: [],
  outcome: 'no_action',
  follow_up_required: false,
  follow_up_date: '',
  follow_up_task: '',
});

// Combined "we walked into a store that isn't in the system yet" flow -
// creates a bare-minimum Customer record (name, contact, phone/email - no
// address, type, etc. required, those get filled in properly later) and
// logs the visit against it in one step, instead of Add Customer then Log
// Visit as two separate trips through the Customers page. New customers
// created here default to 'prospect' status since a walk-in visit doesn't
// yet mean a trading account - promote them from the Customers page once
// they're actually placing orders.
export default function NewCustomerVisitDialog({ open, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankForm());
  const [productPick, setProductPick] = useState('');

  const productsQuery = useQuery({ queryKey: ['recipes'], queryFn: () => db.Recipe.list('name', 500), enabled: open });
  const productOptions = (productsQuery.data || []).filter((p) => !form.discussed_products.includes(p.name));

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleClose = () => {
    setForm(blankForm());
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const customer = await db.Customer.create({
        business_name: form.business_name.trim(),
        primary_contact: form.primary_contact.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        status: 'prospect',
      });
      return db.CustomerActivity.create({
        customer_id: customer.id,
        type: 'visit',
        date: form.date,
        time: form.time || null,
        subtype: form.subtype,
        notes: form.notes || null,
        discussed_products: form.discussed_products,
        outcome: form.outcome,
        follow_up_required: form.follow_up_required,
        follow_up_date: form.follow_up_required && form.follow_up_date ? form.follow_up_date : null,
        follow_up_task: form.follow_up_required ? form.follow_up_task || null : null,
        recorded_by: user?.full_name || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customerActivities'] });
      toast.success(`${form.business_name.trim()} added and visit logged`);
      handleClose();
    },
    onError: (e) => toast.error('Failed to save: ' + e.message),
  });

  const canSubmit = form.business_name.trim() && form.primary_contact.trim() && (form.phone.trim() || form.email.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Log New Customer Visit</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-5 mt-2">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New Customer</p>
            <div>
              <Label>Store Name</Label>
              <Input value={form.business_name} onChange={(e) => set('business_name', e.target.value)} placeholder="e.g. Coastal Liquor" required />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input value={form.primary_contact} onChange={(e) => set('primary_contact', e.target.value)} placeholder="Name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">At least one of phone or email is required.</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visit Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Visited by</Label>
              <Input value={user?.full_name || ''} disabled className="bg-muted" />
            </div>

            <div>
              <Label>Visit Type</Label>
              <Select value={form.subtype} onValueChange={(v) => set('subtype', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={4} placeholder="What happened during the visit?" />
            </div>

            <div>
              <Label>Discussed</Label>
              {productOptions.length > 0 && (
                <Select value={productPick} onValueChange={(v) => { set('discussed_products', [...form.discussed_products, v]); setProductPick(''); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Add a product…" /></SelectTrigger>
                  <SelectContent>
                    {productOptions.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {form.discussed_products.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.discussed_products.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 py-1 text-xs">
                      {name}
                      <button type="button" onClick={() => set('discussed_products', form.discussed_products.filter((n) => n !== name))} className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Outcome</Label>
              <Select value={form.outcome} onValueChange={(v) => set('outcome', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
                    <Input value={form.follow_up_task} onChange={(e) => set('follow_up_task', e.target.value)} placeholder="e.g. Send pricing" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Add Customer & Log Visit'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
