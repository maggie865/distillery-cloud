import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pencil, X, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_PACKAGING_ITEM = { name: '', quantity: 1, unit: 'units', type: 'bottle' };
const EMPTY_FORM = {
  name: '', base_recipe_id: '', bottle_size_ml: '', product_id: '', bottles_per_case: '',
  packaging: [{ ...EMPTY_PACKAGING_ITEM }],
};

// Fetch packaging items from RawMaterial stock for dropdown selection —
// copied from RecipeManager.jsx rather than shared, to keep each settings
// panel's state self-contained.
function usePackagingStock() {
  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 5000),
  });
  return rawMaterials.filter(m => m.type === 'packaging' || m.type === 'Packaging');
}

function PackagingSelect({ value, onChange }) {
  const packagingStock = usePackagingStock();
  const [custom, setCustom] = useState(false);
  const inStock = packagingStock.some(m => m.name === value);

  if (custom || (value && !inStock)) {
    return (
      <div className="flex gap-1">
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder="Type packaging name" className="flex-1" />
        {packagingStock.length > 0 && (
          <button type="button" onClick={() => setCustom(false)} className="text-xs text-primary underline whitespace-nowrap">Pick from stock</button>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <select value={value} onChange={e => onChange(e.target.value)} className="flex-1 border border-border rounded-md px-2 py-1 text-sm bg-background">
        <option value="">— Select packaging item —</option>
        {packagingStock.map(m => <option key={m.id} value={m.name}>{m.name} ({m.quantity || 0} {m.unit || 'units'} in stock)</option>)}
      </select>
      <button type="button" onClick={() => setCustom(true)} className="text-xs text-muted-foreground underline whitespace-nowrap">Custom</button>
    </div>
  );
}

// "Packaging Recipes" = bottle-size variants: each links a base spirit
// recipe + a bottle size + the specific finished-good Product it produces
// at bottling, plus its own packaging line items (bottle, closure, label,
// carton). This is the recipe_type:'packaging' row BottlingFloor.jsx and
// useRawMaterialsNetStock.js already read — this is the first Settings UI
// that can actually create/edit one (previously SQL-only).
export default function PackagingRecipeManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const { data: allRecipes = [], isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 500),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('sort_order', 1000),
  });

  const spiritRecipes = allRecipes.filter(r => r.recipe_type === 'spirit');
  const packagingRecipes = allRecipes.filter(r => r.recipe_type === 'packaging');

  const createProductMutation = useMutation({
    mutationFn: (data) => base44.entities.Product.create(data),
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setForm(f => ({ ...f, product_id: product.id }));
      toast.success(`Product "${product.name}" created`);
    },
    onError: (e) => toast.error(e.message || 'Failed to create product'),
  });

  const handleQuickCreateProduct = () => {
    if (!form.name.trim()) { toast.error('Enter a name for this packaging recipe first'); return; }
    createProductMutation.mutate({
      name: form.name.trim(),
      bottle_size_ml: form.bottle_size_ml ? parseInt(form.bottle_size_ml) : null,
      active: true,
    });
  };

  const buildPayload = (data) => ({
    recipe_type: 'packaging',
    name: data.name.trim(),
    base_recipe_id: data.base_recipe_id || null,
    bottle_size_ml: data.bottle_size_ml ? parseInt(data.bottle_size_ml) : null,
    product_id: data.product_id || null,
    bottles_per_case: data.bottles_per_case ? parseInt(data.bottles_per_case) : undefined,
    ingredients: [],
    packaging: (data.packaging || [])
      .filter(p => p.name && p.name.trim())
      .map(p => ({ ...p, quantity: parseFloat(p.quantity) || 0 })),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Recipe.create(buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setForm(EMPTY_FORM);
      toast.success('Packaging recipe created');
    },
    onError: (e) => toast.error(e.message || 'Failed to create packaging recipe'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Recipe.update(id, buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setForm(EMPTY_FORM);
      setEditingId(null);
      toast.success('Packaging recipe updated');
    },
    onError: (e) => toast.error(e.message || 'Failed to update packaging recipe'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Recipe.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Packaging recipe deleted');
    },
    onError: (e) => toast.error(e.message || 'Failed to delete packaging recipe'),
  });

  const handleAddPackaging = () => setForm(prev => ({ ...prev, packaging: [...(prev.packaging || []), { ...EMPTY_PACKAGING_ITEM }] }));
  const handleRemovePackaging = (index) => setForm(prev => ({ ...prev, packaging: prev.packaging.filter((_, i) => i !== index) }));
  const handleSetPackaging = (index, field, value) => setForm(prev => {
    const packaging = [...prev.packaging];
    packaging[index] = { ...packaging[index], [field]: value };
    return { ...prev, packaging };
  });

  const handleEdit = (recipe) => {
    setEditingId(recipe.id);
    setForm({
      name: recipe.name || '',
      base_recipe_id: recipe.base_recipe_id || '',
      bottle_size_ml: recipe.bottle_size_ml?.toString() || '',
      product_id: recipe.product_id || '',
      bottles_per_case: recipe.bottles_per_case?.toString() || '',
      packaging: recipe.packaging?.length ? recipe.packaging.map(p => ({
        name: p.name || '', quantity: p.quantity?.toString() || '', unit: p.unit || 'units', type: p.type || 'bottle',
      })) : [{ ...EMPTY_PACKAGING_ITEM }],
    });
    document.getElementById('packaging-recipe-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelEdit = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.bottle_size_ml) { toast.error('Bottle size is required'); return; }
    if (editingId) updateMutation.mutate({ id: editingId, data: form });
    else createMutation.mutate(form);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const recipeName = (id) => spiritRecipes.find(r => r.id === id)?.name || 'Unknown recipe';
  const productName = (id) => products.find(p => p.id === id)?.name || 'No product linked';

  return (
    <>
      <Card id="packaging-recipe-form-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><PackagePlus className="w-5 h-5" /> {editingId ? 'Edit Packaging Recipe' : 'Create New Packaging Recipe'}</span>
            {editingId && <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="gap-1"><X className="w-4 h-4" /> Cancel</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bluff Gin 700ml" required />
              </div>
              <div>
                <Label>Base Spirit Recipe</Label>
                <Select value={form.base_recipe_id} onValueChange={(v) => setForm({ ...form, base_recipe_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select spirit recipe…" /></SelectTrigger>
                  <SelectContent>
                    {spiritRecipes.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No spirit recipes yet — create one under Recipes first</div>}
                    {spiritRecipes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bottle Size (ml)</Label>
                <Input type="number" value={form.bottle_size_ml} onChange={(e) => setForm({ ...form, bottle_size_ml: e.target.value })} placeholder="700" required />
              </div>
              <div className="col-span-2">
                <Label>Finished Good Product</Label>
                <div className="flex gap-2">
                  <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select product…" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.bottle_size_ml ? ` (${p.bottle_size_ml}ml)` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={handleQuickCreateProduct} disabled={createProductMutation.isPending} className="shrink-0 gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> New Product
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Which Customer Stock/Quick Order catalog entry this bottle size produces at bottling.</p>
              </div>
              <div>
                <Label>Bottles per Case</Label>
                <Input type="number" value={form.bottles_per_case} onChange={(e) => setForm({ ...form, bottles_per_case: e.target.value })} placeholder="12" />
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Packaging (per bottle)</p>
                <Button type="button" variant="outline" size="sm" onClick={handleAddPackaging}><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
              {(form.packaging || []).map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_80px_auto] gap-2 items-end">
                  <PackagingSelect value={p.name} onChange={(val) => handleSetPackaging(i, 'name', val)} />
                  <Input type="number" step="0.01" value={p.quantity} onChange={(e) => handleSetPackaging(i, 'quantity', e.target.value)} placeholder="1" />
                  <Select value={p.type} onValueChange={(val) => handleSetPackaging(i, 'type', val)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottle">Bottle</SelectItem>
                      <SelectItem value="closure">Closure</SelectItem>
                      <SelectItem value="label">Label</SelectItem>
                      <SelectItem value="carton">Carton</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => handleRemovePackaging(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? 'Saving…' : editingId ? 'Update Packaging Recipe' : 'Create Packaging Recipe'}</Button>
              {editingId && <Button type="button" variant="outline" onClick={handleCancelEdit}>Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Existing Packaging Recipes</h3>
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : packagingRecipes.length === 0 ? (
          <p className="text-muted-foreground">No packaging recipes yet — bottling can't start until at least one exists.</p>
        ) : (
          <div className="grid gap-3">
            {packagingRecipes.map((recipe) => (
              <Card key={recipe.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">{recipe.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {recipe.bottle_size_ml ? `${recipe.bottle_size_ml}ml` : 'No size set'} · from {recipeName(recipe.base_recipe_id)} · produces {productName(recipe.product_id)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(recipe)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(recipe.id)}><Trash2 className="w-4 h-4" /></Button>
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
