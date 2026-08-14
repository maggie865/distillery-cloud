import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AddressAutocomplete from '@/components/shared/AddressAutocomplete';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { VISIT_FREQUENCIES } from '@/lib/customerHealth';

export const CUSTOMER_TYPES = ['Retail', 'Wholesale', 'Hospitality', 'Distributor', 'Export', 'Other'];
export const CUSTOMER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_hold', label: 'On Hold' },
];

const blankForm = () => ({
  business_name: '', trading_name: '', customer_type: '', delivery_address: '', postal_address: '',
  city: '', region: '', country: 'New Zealand', website: '', phone: '', email: '',
  primary_contact: '', contact_role: '', notes: '', status: 'active', account_manager: '',
  customer_since: '', visit_frequency: '', follow_up_tracking_enabled: true,
});

export default function CustomerFormDialog({ customer, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankForm());

  useEffect(() => {
    if (customer) {
      setForm({
        business_name: customer.business_name || '',
        trading_name: customer.trading_name || '',
        customer_type: customer.customer_type || '',
        delivery_address: customer.delivery_address || '',
        postal_address: customer.postal_address || '',
        city: customer.city || '',
        region: customer.region || '',
        country: customer.country || 'New Zealand',
        website: customer.website || '',
        phone: customer.phone || '',
        email: customer.email || '',
        primary_contact: customer.primary_contact || '',
        contact_role: customer.contact_role || '',
        notes: customer.notes || '',
        status: customer.status || 'active',
        account_manager: customer.account_manager || '',
        customer_since: customer.customer_since || '',
        visit_frequency: customer.visit_frequency || '',
        follow_up_tracking_enabled: customer.follow_up_tracking_enabled !== false,
      });
    } else if (open) {
      setForm(blankForm());
    }
  }, [customer, open]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        customer_type: form.customer_type || null,
        postal_address: form.postal_address || null,
        city: form.city || null,
        region: form.region || null,
        website: form.website || null,
        phone: form.phone || null,
        email: form.email || null,
        primary_contact: form.primary_contact || null,
        contact_role: form.contact_role || null,
        notes: form.notes || null,
        account_manager: form.account_manager || null,
        customer_since: form.customer_since || null,
        visit_frequency: form.visit_frequency || null,
        trading_name: form.trading_name || null,
      };
      return customer ? db.Customer.update(customer.id, payload) : db.Customer.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(customer ? 'Customer updated' : 'Customer added');
      onOpenChange(false);
    },
    onError: (e) => toast.error('Failed to save: ' + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => { if (e.target?.closest?.('.pac-container')) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (e.target?.closest?.('.pac-container')) e.preventDefault(); }}
      >
        <DialogHeader><DialogTitle className="font-display">{customer ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-5 mt-2">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basic Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label>Customer Name</Label>
                <Input value={form.business_name} onChange={(e) => set('business_name', e.target.value)} placeholder="e.g. Coastal Liquor" required />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label>Trading Name</Label>
                <Input value={form.trading_name} onChange={(e) => set('trading_name', e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Customer Type</Label>
                <Select value={form.customer_type} onValueChange={(v) => set('customer_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Xero Contact ID</Label>
                <Input value={customer?.xero_contact_id || ''} readOnly placeholder="Not yet linked" className="bg-muted" />
              </div>
              <div className="col-span-2">
                <Label>Physical / Delivery Address</Label>
                <AddressAutocomplete value={form.delivery_address} onChange={(v) => set('delivery_address', v)} placeholder="Full address" />
              </div>
              <div className="col-span-2">
                <Label>Postal Address</Label>
                <Input value={form.postal_address} onChange={(e) => set('postal_address', e.target.value)} placeholder="If different from physical address" />
              </div>
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div>
                <Label>Region</Label>
                <Input value={form.region} onChange={(e) => set('region', e.target.value)} />
              </div>
              <div>
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => set('country', e.target.value)} />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <Label>Primary Contact</Label>
                <Input value={form.primary_contact} onChange={(e) => set('primary_contact', e.target.value)} placeholder="Name" />
              </div>
              <div>
                <Label>Contact Role</Label>
                <Input value={form.contact_role} onChange={(e) => set('contact_role', e.target.value)} placeholder="e.g. Store Manager" />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sales Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account Manager</Label>
                <Input value={form.account_manager} onChange={(e) => set('account_manager', e.target.value)} />
              </div>
              <div>
                <Label>Customer Since</Label>
                <Input type="date" value={form.customer_since} onChange={(e) => set('customer_since', e.target.value)} />
              </div>
              <div>
                <Label>Visit Frequency</Label>
                <Select value={form.visit_frequency} onValueChange={(v) => set('visit_frequency', v)}>
                  <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                  <SelectContent>
                    {VISIT_FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-start gap-2 rounded-lg border border-border p-3">
                <Checkbox
                  checked={form.follow_up_tracking_enabled}
                  onCheckedChange={(v) => set('follow_up_tracking_enabled', v === true)}
                  className="mt-0.5"
                />
                <div>
                  <Label className="cursor-pointer" onClick={() => set('follow_up_tracking_enabled', !form.follow_up_tracking_enabled)}>Track for visits &amp; follow-ups</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Turn off for one-time purchasers or inconsistent buyers — stops them appearing in Needs Attention for overdue visits/contact. Open requests and manually scheduled follow-ups still show.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending || !form.business_name || !form.delivery_address}>
            {mutation.isPending ? 'Saving…' : customer ? 'Save Changes' : 'Add Customer'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
