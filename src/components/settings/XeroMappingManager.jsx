import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Pencil, X, Link2 } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = {
  xero_item_code: '', xero_description: '', product_id: '',
  bottles_per_line_unit: '1', duty_free: false, sample_dispatch: false, active: true, notes: '',
};

// Maps a Xero invoice line item to a real product — this is what lets one
// product (e.g. "London Dry Gin 700ml") be sold in Xero under several
// different line items (a case vs a single bottle, duty-free vs promo/
// sample variants) and still land as the right quantity_bottles/flags when
// synced in. Matched by xero_item_code first; xero_description is only a
// fallback for line items with no Xero Item Code set. See
// xero-sync-invoices for exactly how this gets used.
export default function XeroMappingManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['xeroItemMappings'],
    queryFn: () => base44.entities.XeroItemMapping.list('-created_at', 1000),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('sort_order', 1000),
  });

  const buildPayload = (data) => ({
    xero_item_code: data.xero_item_code.trim() || null,
    xero_description: data.xero_description.trim() || null,
    product_id: data.product_id || null,
    bottles_per_line_unit: parseInt(data.bottles_per_line_unit) || 1,
    duty_free: data.duty_free === true,
    sample_dispatch: data.sample_dispatch === true,
    active: data.active,
    notes: data.notes.trim() || null,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.XeroItemMapping.create(buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xeroItemMappings'] });
      setForm(EMPTY_FORM);
      toast.success('Mapping created');
    },
    onError: (e) => toast.error(e.message || 'Failed to create mapping'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.XeroItemMapping.update(id, buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xeroItemMappings'] });
      setForm(EMPTY_FORM);
      setEditingId(null);
      toast.success('Mapping updated');
    },
    onError: (e) => toast.error(e.message || 'Failed to update mapping'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.XeroItemMapping.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xeroItemMappings'] });
      toast.success('Mapping deleted');
    },
    onError: () => toast.error('Failed to delete mapping'),
  });

  const toggleActive = (mapping) => updateMutation.mutate({
    id: mapping.id,
    data: {
      xero_item_code: mapping.xero_item_code || '', xero_description: mapping.xero_description || '',
      product_id: mapping.product_id || '', bottles_per_line_unit: mapping.bottles_per_line_unit?.toString() || '1',
      duty_free: mapping.duty_free === true, sample_dispatch: mapping.sample_dispatch === true,
      notes: mapping.notes || '', active: !mapping.active,
    },
  });

  const handleEdit = (mapping) => {
    setEditingId(mapping.id);
    setForm({
      xero_item_code: mapping.xero_item_code || '',
      xero_description: mapping.xero_description || '',
      product_id: mapping.product_id || '',
      bottles_per_line_unit: mapping.bottles_per_line_unit?.toString() || '1',
      duty_free: mapping.duty_free === true,
      sample_dispatch: mapping.sample_dispatch === true,
      active: mapping.active !== false,
      notes: mapping.notes || '',
    });
    document.getElementById('xero-mapping-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelEdit = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.xero_item_code.trim() && !form.xero_description.trim()) {
      toast.error('Enter a Xero Item Code or Description to match on'); return;
    }
    if (!form.product_id) { toast.error('Choose which product this maps to'); return; }
    if (editingId) updateMutation.mutate({ id: editingId, data: form });
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const productName = (id) => products.find((p) => p.id === id)?.name || 'Unknown product';

  return (
    <>
      <Card id="xero-mapping-form-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Link2 className="w-5 h-5" /> {editingId ? 'Edit Mapping' : 'Create New Mapping'}</span>
            {editingId && <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="gap-1"><X className="w-4 h-4" /> Cancel</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Xero Item Code</Label>
                <Input value={form.xero_item_code} onChange={(e) => setForm({ ...form, xero_item_code: e.target.value })} placeholder="e.g. LDG700-CASE6" />
              </div>
              <div>
                <Label>Xero Description (fallback match)</Label>
                <Input value={form.xero_description} onChange={(e) => setForm({ ...form, xero_description: e.target.value })} placeholder="Used only if no Item Code" />
              </div>
              <div className="col-span-2">
                <Label>Product</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}{p.bottle_size_ml ? ` (${p.bottle_size_ml}ml)` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bottles per Line Unit</Label>
                <Input type="number" min="1" value={form.bottles_per_line_unit} onChange={(e) => setForm({ ...form, bottles_per_line_unit: e.target.value })} placeholder="1" />
                <p className="text-xs text-muted-foreground mt-1">e.g. 6 or 12 if this Xero line represents a case, not a single bottle</p>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.duty_free} onCheckedChange={(v) => setForm({ ...form, duty_free: v === true })} />
                <Label className="cursor-pointer" onClick={() => setForm({ ...form, duty_free: !form.duty_free })}>Duty free</Label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.sample_dispatch} onCheckedChange={(v) => setForm({ ...form, sample_dispatch: v === true })} />
                <Label className="cursor-pointer" onClick={() => setForm({ ...form, sample_dispatch: !form.sample_dispatch })}>Sample / promo</Label>
              </div>
              <div className="col-span-2 flex items-center gap-2 text-sm">
                <Checkbox checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v === true })} />
                <Label className="cursor-pointer" onClick={() => setForm({ ...form, active: !form.active })}>Active — used when syncing new invoices</Label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? 'Saving…' : editingId ? 'Update Mapping' : 'Create Mapping'}</Button>
              {editingId && <Button type="button" variant="outline" onClick={handleCancelEdit}>Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Existing Mappings</h3>
        {isLoading ? (
          <p className="text-muted-foreground">Loading mappings...</p>
        ) : mappings.length === 0 ? (
          <p className="text-muted-foreground">No mappings yet — unmapped Xero line items still sync in as draft dispatches, just without a product/quantity pre-filled.</p>
        ) : (
          <div className="grid gap-3">
            {mappings.map((mapping) => (
              <Card key={mapping.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{mapping.xero_item_code || mapping.xero_description}</p>
                        {!mapping.active && <span className="px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground font-medium">Inactive</span>}
                        {mapping.duty_free && <span className="px-1.5 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 font-medium">Duty Free</span>}
                        {mapping.sample_dispatch && <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 font-medium">Sample</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        → {productName(mapping.product_id)} · {mapping.bottles_per_line_unit} bottle{mapping.bottles_per_line_unit === 1 ? '' : 's'} per line unit
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleActive(mapping)}>{mapping.active ? 'Deactivate' : 'Activate'}</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(mapping)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(mapping.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
