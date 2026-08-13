import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Pencil, X, Package } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = { sku: '', name: '', bottle_size_ml: '', active: true, sort_order: '' };

// The finished-good product catalog itself — SKU, name, bottle size, active
// flag. Referenced by customer_par_level/customer_stock_check (Customer
// Stock/Quick Order) and by recipe/finished_good (production linkage), so
// deactivating rather than deleting is the primary way to retire a product
// that's already in use elsewhere.
export default function ProductsManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('sort_order', 1000),
  });

  const buildPayload = (data) => ({
    sku: data.sku.trim() || null,
    name: data.name.trim(),
    bottle_size_ml: data.bottle_size_ml ? parseInt(data.bottle_size_ml) : null,
    active: data.active,
    sort_order: data.sort_order ? parseInt(data.sort_order) : null,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Product.create(buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setForm(EMPTY_FORM);
      toast.success('Product created');
    },
    onError: (e) => toast.error(e.message || 'Failed to create product'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setForm(EMPTY_FORM);
      setEditingId(null);
      toast.success('Product updated');
    },
    onError: (e) => toast.error(e.message || 'Failed to update product'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted');
    },
    onError: () => toast.error('Failed to delete — this product may still be referenced elsewhere. Try deactivating it instead.'),
  });

  const toggleActive = (product) => updateMutation.mutate({ id: product.id, data: { ...product, sku: product.sku || '', bottle_size_ml: product.bottle_size_ml?.toString() || '', sort_order: product.sort_order?.toString() || '', active: !product.active } });

  const handleEdit = (product) => {
    setEditingId(product.id);
    setForm({
      sku: product.sku || '',
      name: product.name || '',
      bottle_size_ml: product.bottle_size_ml?.toString() || '',
      active: product.active !== false,
      sort_order: product.sort_order?.toString() || '',
    });
    document.getElementById('product-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelEdit = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Product name is required'); return; }
    if (editingId) updateMutation.mutate({ id: editingId, data: form });
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card id="product-form-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Package className="w-5 h-5" /> {editingId ? 'Edit Product' : 'Create New Product'}</span>
            {editingId && <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="gap-1"><X className="w-4 h-4" /> Cancel</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Product Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bluff Gin 700ml" required />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label>Bottle Size (ml)</Label>
                <Input type="number" value={form.bottle_size_ml} onChange={(e) => setForm({ ...form, bottle_size_ml: e.target.value })} placeholder="700" />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} placeholder="Optional" />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v === true })} />
                  Active — available for sale / Quick Order
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? 'Saving…' : editingId ? 'Update Product' : 'Create Product'}</Button>
              {editingId && <Button type="button" variant="outline" onClick={handleCancelEdit}>Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Existing Products</h3>
        {isLoading ? (
          <p className="text-muted-foreground">Loading products...</p>
        ) : products.length === 0 ? (
          <p className="text-muted-foreground">No products yet</p>
        ) : (
          <div className="grid gap-3">
            {products.map((product) => (
              <Card key={product.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{product.name}</p>
                        {!product.active && <span className="px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground font-medium">Inactive</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{product.bottle_size_ml ? `${product.bottle_size_ml}ml` : 'No size set'}{product.sku ? ` · SKU ${product.sku}` : ''}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleActive(product)}>{product.active ? 'Deactivate' : 'Activate'}</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(product)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(product.id)}><Trash2 className="w-4 h-4" /></Button>
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
