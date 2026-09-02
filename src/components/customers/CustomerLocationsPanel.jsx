import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Plus, Pencil, Trash2, ChevronDown, Phone, Mail, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

const BLANK_FORM = { location_name: '', address: '', city: '', region: '', contact_name: '', contact_phone: '', contact_email: '', notes: '', active: true };

function LocationHistory({ location, dispatches }) {
  const [open, setOpen] = useState(false);
  const history = dispatches
    .filter((d) => d.location_id === location.id)
    .sort((a, b) => (b.dispatch_date || '').localeCompare(a.dispatch_date || ''));

  if (history.length === 0) {
    return <p className="text-xs text-muted-foreground mt-2">No dispatch history yet for this location.</p>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <span>{history.length} dispatch{history.length === 1 ? '' : 'es'} to this location</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="overflow-x-auto border rounded-lg mt-2">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {history.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm whitespace-nowrap">{d.dispatch_date ? format(parseISO(d.dispatch_date), 'd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm">{d.product_name}{d.bottle_size_ml ? ` (${d.bottle_size_ml}ml)` : ''}</TableCell>
                  <TableCell className="text-sm text-right">{d.quantity_bottles}</TableCell>
                  <TableCell className="text-sm capitalize">{d.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Monthly bottle counts a multi-store customer reports back to us after the
// fact, per location - not derived from dispatch records, since a bulk
// master-order dispatch usually isn't tagged to any one store at all (see
// migration 20260823000000). Shows a "last reported" figure with a trend
// arrow right on the location card so performance is visible at a glance
// without opening every location, plus a log of every month reported.
function LocationAllocations({ location, allocations, onAdd, isAdding }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM'));
  const [bottles, setBottles] = useState('');
  const [notes, setNotes] = useState('');

  const sorted = allocations
    .filter((a) => a.location_id === location.id)
    .sort((a, b) => (b.period_month || '').localeCompare(a.period_month || ''));
  const latest = sorted[0];
  const previous = sorted[1];
  const trend = latest && previous ? latest.quantity_bottles - previous.quantity_bottles : null;

  const canSubmit = month && parseInt(bottles) >= 0;
  const submit = () => {
    onAdd({ location_id: location.id, period_month: `${month}-01`, quantity_bottles: parseInt(bottles) || 0, notes: notes.trim() || undefined });
    setBottles('');
    setNotes('');
  };

  return (
    <div className="mt-2">
      {latest && (
        <p className="text-xs flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground">Last reported:</span>
          <span className="font-semibold text-foreground">{latest.quantity_bottles.toLocaleString()} bottles</span>
          <span className="text-muted-foreground">({format(parseISO(latest.period_month), 'MMM yyyy')})</span>
          {trend !== null && trend !== 0 && (
            <span className={`inline-flex items-center gap-0.5 font-medium ${trend > 0 ? 'text-success' : 'text-destructive'}`}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend)} vs prior month
            </span>
          )}
        </p>
      )}
      <Collapsible open={open} onOpenChange={setOpen} className="mt-1">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <span>{sorted.length > 0 ? `${sorted.length} month${sorted.length === 1 ? '' : 's'} reported` : 'Log a monthly total'}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          <div className="flex flex-wrap items-end gap-2 p-2 rounded-lg border border-dashed border-border">
            <div>
              <Label className="text-xs">Month</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="w-28">
              <Label className="text-xs">Bottles</Label>
              <Input type="number" min="0" value={bottles} onChange={(e) => setBottles(e.target.value)} className="h-8 text-sm" placeholder="0" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-sm" placeholder="e.g. product breakdown" />
            </div>
            <Button size="sm" className="h-8" disabled={!canSubmit || isAdding} onClick={submit}>Add</Button>
          </div>
          {sorted.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Bottles</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {sorted.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm whitespace-nowrap">{format(parseISO(a.period_month), 'MMM yyyy')}</TableCell>
                      <TableCell className="text-sm text-right font-medium">{a.quantity_bottles.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function CustomerLocationsPanel({ customerId, dispatches = [] }) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [showInactive, setShowInactive] = useState(false);

  const { data: allLocations = [], isLoading } = useQuery({
    queryKey: ['customerLocations', customerId],
    queryFn: async () => (await db.CustomerLocation.list('location_name', 500)).filter((l) => l.customer_id === customerId),
  });
  const locations = allLocations.filter((l) => showInactive || l.active);
  const locationIds = allLocations.map((l) => l.id);

  const { data: allAllocations = [] } = useQuery({
    queryKey: ['customerLocationAllocations', customerId],
    queryFn: async () => (await db.CustomerLocationAllocation.list('-period_month', 2000)).filter((a) => locationIds.includes(a.location_id)),
    enabled: locationIds.length > 0,
  });

  const addAllocationMutation = useMutation({
    mutationFn: (data) => db.CustomerLocationAllocation.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customerLocationAllocations', customerId] }); toast.success('Monthly total logged'); },
    onError: (e) => toast.error(e.message || 'Failed to log monthly total'),
  });

  const createMutation = useMutation({
    mutationFn: () => db.CustomerLocation.create({
      customer_id: customerId,
      location_name: form.location_name.trim(),
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      region: form.region.trim() || undefined,
      contact_name: form.contact_name.trim() || undefined,
      contact_phone: form.contact_phone.trim() || undefined,
      contact_email: form.contact_email.trim() || undefined,
      notes: form.notes.trim() || undefined,
      active: form.active,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customerLocations', customerId] }); closeForm(); toast.success('Location added'); },
    onError: (e) => toast.error(e.message || 'Failed to add location'),
  });

  const updateMutation = useMutation({
    mutationFn: () => db.CustomerLocation.update(editingLocation.id, {
      location_name: form.location_name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      region: form.region.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customerLocations', customerId] }); closeForm(); toast.success('Location updated'); },
    onError: (e) => toast.error(e.message || 'Failed to update location'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.CustomerLocation.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customerLocations', customerId] }); toast.success('Location removed'); },
    onError: (e) => toast.error(e.message || 'Failed to remove location'),
  });

  const openAdd = () => { setEditingLocation(null); setForm(BLANK_FORM); setFormOpen(true); };
  const openEdit = (loc) => {
    setEditingLocation(loc);
    setForm({
      location_name: loc.location_name, address: loc.address || '', city: loc.city || '', region: loc.region || '',
      contact_name: loc.contact_name || '', contact_phone: loc.contact_phone || '', contact_email: loc.contact_email || '',
      notes: loc.notes || '', active: loc.active,
    });
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditingLocation(null); setForm(BLANK_FORM); };

  const canSubmit = form.location_name.trim();

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Locations</h2>
        <div className="flex items-center gap-2">
          {allLocations.some((l) => !l.active) && (
            <Button size="sm" variant={showInactive ? 'default' : 'outline'} onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Location</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
      ) : locations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No separate locations recorded — dispatches go to this customer's main address. Add one if this customer has multiple stores.
        </p>
      ) : (
        <div className="space-y-3">
          {locations.map((loc) => (
            <div key={loc.id} className={`rounded-lg border border-border p-3 ${!loc.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{loc.location_name}</p>
                    {!loc.active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  {(loc.address || loc.city || loc.region) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" /> {[loc.address, loc.city, loc.region].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {loc.contact_name && <p className="text-xs text-muted-foreground mt-0.5">{loc.contact_name}</p>}
                  <div className="flex items-center gap-3 mt-0.5">
                    {loc.contact_phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {loc.contact_phone}</span>}
                    {loc.contact_email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> {loc.contact_email}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(loc)} className="text-muted-foreground hover:text-foreground transition-colors p-1"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm(`Remove ${loc.location_name}? Past dispatches to it stay on record.`)) deleteMutation.mutate(loc.id); }} className="text-muted-foreground hover:text-destructive transition-colors p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <LocationAllocations
                location={loc}
                allocations={allAllocations}
                onAdd={addAllocationMutation.mutate}
                isAdding={addAllocationMutation.isPending}
              />
              <LocationHistory location={loc} dispatches={dispatches} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(v) => !v && closeForm()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editingLocation ? 'Edit Location' : 'Add Location'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Location name</Label>
              <Input value={form.location_name} onChange={(e) => setForm((f) => ({ ...f, location_name: e.target.value }))} placeholder="e.g. Queenstown Branch" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">City</Label>
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Region</Label>
                <Input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Contact name</Label>
              <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Contact phone</Label>
                <Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Contact email</Label>
                <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: !!v }))} />
              <Label className="text-sm font-normal">Active (shows up when picking a location for a dispatch)</Label>
            </div>
            <Button
              className="w-full"
              disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
              onClick={() => (editingLocation ? updateMutation.mutate() : createMutation.mutate())}
            >
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingLocation ? 'Save Changes' : 'Add Location'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
