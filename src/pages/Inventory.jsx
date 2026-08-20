import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useRawMaterialsNetStock } from '@/hooks/useRawMaterialsNetStock';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Warehouse, Wine, Package, Pencil, Trash2, SlidersHorizontal, ChevronDown, ChevronRight, Bell, AlertTriangle, ClipboardCheck, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StockReconciliation from '@/components/inventory/StockReconciliation';
import Pagination from '@/components/ui/Pagination';

const typeColors = {
  ethanol: 'bg-amber-100 text-amber-800',
  botanical: 'bg-emerald-100 text-emerald-800',
  grain: 'bg-yellow-100 text-yellow-800',
  sugar: 'bg-pink-100 text-pink-800',
  water: 'bg-blue-100 text-blue-800',
  flavoring: 'bg-purple-100 text-purple-800',
  packaging: 'bg-sky-100 text-sky-800',
  other: 'bg-muted text-muted-foreground',
};

// ── Adjust Stock Dialog ──────────────────────────────────────────────────────
function AdjustDialog({ item, entity, onClose, queryKey }) {
  const qc = useQueryClient();
  const isFinished = entity === 'FinishedGood';
  const [value, setValue] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const newQty = parseFloat(value) || 0;

      // quantity_bottles / quantity is already the correct displayed stock — store directly.
      const storedQty = newQty;
      const update = isFinished ? { quantity_bottles: storedQty } : { quantity: storedQty };

      // Recalculate LALs
      if (!isFinished) {
        if (item.abv_percent) {
          // Ethanol/spirit — recalculate from ABV and quantity
          update.lals = parseFloat((newQty * item.abv_percent / 100).toFixed(4));
        } else if (item.lals && item.quantity) {
          // No ABV — scale proportionally from current ratio
          const lalsPerUnit = item.quantity > 0 ? item.lals / item.quantity : 0;
          if (lalsPerUnit > 0) update.lals = parseFloat((newQty * lalsPerUnit).toFixed(4));
        }
      }
      if (isFinished) {
        if (item.abv_percent && item.bottle_size_ml) {
          // Recalculate from ABV and bottle size
          update.total_lals = parseFloat((newQty * item.bottle_size_ml * item.abv_percent / 100 / 1000).toFixed(4));
        } else if (item.total_lals && item.quantity_bottles) {
          // No ABV set — scale proportionally from current ratio (lals per bottle)
          const lalsPerBottle = item.quantity_bottles > 0 ? item.total_lals / item.quantity_bottles : 0;
          if (lalsPerBottle > 0) update.total_lals = parseFloat((newQty * lalsPerBottle).toFixed(4));
        }
      }

      const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
      return entityMap[entity].update(item.id, update);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      onClose();
      // Show undo toast for 10 seconds
      toast('Record updated', {
        description: 'Changes saved successfully',
        action: {
          label: 'Undo',
          onClick: async () => {
            const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
            if (lastSavedState.id && lastSavedState.previous) {
              await entityMap[lastSavedState.entity].update(lastSavedState.id, lastSavedState.previous);
              qc.invalidateQueries({ queryKey: [queryKey] });
              toast.success('Change undone successfully');
              lastSavedState.id = null;
              lastSavedState.previous = null;
            }
          },
        },
        duration: 10000,
      });
    },
    onError: (err) => toast.error(err.message || 'Failed to adjust stock'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" /> Adjust Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{isFinished ? item.product_name : item.name}</span>
            {' — current: '}<span className="font-semibold">{isFinished ? item.quantity_bottles : item.quantity} {isFinished ? 'bottles' : item.unit}</span>
          </p>
          <div className="space-y-1">
            <Label>New quantity</Label>
            <Input type="number" min="0" step="0.001" value={value} onChange={e => setValue(e.target.value)} placeholder="Enter new total quantity" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!value || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ──────────────────────────────────────────────────────────────
// Store last saved state globally so undo works after dialog closes
const lastSavedState = { id: null, entity: null, previous: null };

function EditDialog({ item, entity, fields, onClose, queryKey }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...item });
  const formRef = React.useRef(form);
  React.useEffect(() => { formRef.current = form; }, [form]);

  const mutation = useMutation({
    mutationFn: async () => {
      const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
      // Use ref to get latest form values — avoids stale closure bug
      const latestForm = { ...formRef.current };
      // Save previous state for undo before updating
      lastSavedState.id = item.id;
      lastSavedState.entity = entity;
      lastSavedState.previous = { ...item };

      // Auto-recalculate LALs when quantity changes
      if (entity === 'FinishedGood' && latestForm.quantity_bottles !== undefined) {
        const newQty = parseFloat(latestForm.quantity_bottles) || 0;
        const abv = latestForm.abv_percent ?? item.abv_percent;
        const size = latestForm.bottle_size_ml ?? item.bottle_size_ml;
        if (abv && size) {
          latestForm.total_lals = parseFloat((newQty * size * abv / 100 / 1000).toFixed(4));
        } else if (item.total_lals && item.quantity_bottles) {
          const lalsPerBottle = item.quantity_bottles > 0 ? item.total_lals / item.quantity_bottles : 0;
          if (lalsPerBottle > 0) latestForm.total_lals = parseFloat((newQty * lalsPerBottle).toFixed(4));
        }
      }
      if (entity === 'RawMaterial' && latestForm.quantity !== undefined) {
        const newQty = parseFloat(latestForm.quantity) || 0;
        const abv = latestForm.abv_percent ?? item.abv_percent;
        if (abv) {
          latestForm.lals = parseFloat((newQty * abv / 100).toFixed(4));
        } else if (item.lals && item.quantity) {
          const lalsPerUnit = item.quantity > 0 ? item.lals / item.quantity : 0;
          if (lalsPerUnit > 0) latestForm.lals = parseFloat((newQty * lalsPerUnit).toFixed(4));
        }
      }

      // recv- IDs are virtual items — create a real record instead
      if (String(item.id || '').startsWith('recv-')) {
        await entityMap[entity].create(latestForm);
      } else {
        await entityMap[entity].update(item.id, latestForm);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ['receivings'] });
      onClose();
      // Show undo toast for 10 seconds
      toast('Record updated', {
        description: 'Changes saved successfully',
        action: {
          label: 'Undo',
          onClick: async () => {
            const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
            if (lastSavedState.id && lastSavedState.previous) {
              await entityMap[lastSavedState.entity].update(lastSavedState.id, lastSavedState.previous);
              qc.invalidateQueries({ queryKey: [queryKey] });
              toast.success('Change undone successfully');
              lastSavedState.id = null;
              lastSavedState.previous = null;
            }
          },
        },
        duration: 10000,
      });
    },
    onError: (err) => toast.error(err.message || 'Failed to save record'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4" /> Edit Record</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          {fields.map(f => (
            <div key={f.key} className={`space-y-1 ${f.full ? 'col-span-2' : ''}`}>
              <Label>{f.label}</Label>
              {f.type === 'select' ? (
                <Select value={form[f.key] || ''} onValueChange={v => setForm(p => ({ ...p, [f.key]: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {f.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type || 'text'}
                  value={form[f.key] ?? ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ item, entity, label, onClose, queryKey }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
      return entityMap[entity].delete(item.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      onClose();
      // Show undo toast for 10 seconds
      toast('Record updated', {
        description: 'Changes saved successfully',
        action: {
          label: 'Undo',
          onClick: async () => {
            const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
            if (lastSavedState.id && lastSavedState.previous) {
              await entityMap[lastSavedState.entity].update(lastSavedState.id, lastSavedState.previous);
              qc.invalidateQueries({ queryKey: [queryKey] });
              toast.success('Change undone successfully');
              lastSavedState.id = null;
              lastSavedState.previous = null;
            }
          },
        },
        duration: 10000,
      });
    },
    onError: (err) => toast.error(err.message || 'Failed to delete record'),
  });
  return (
    <AlertDialog open onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove <strong>{label}</strong> from inventory. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Action buttons ───────────────────────────────────────────────────────────
function Actions({ onAdjust, onEdit, onDelete, onMoveToTasting, isTasting }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onAdjust} title="Adjust stock"><SlidersHorizontal className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
      {!isTasting && onMoveToTasting && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600 hover:text-amber-700" onClick={onMoveToTasting} title="Move bottles to tasting stock"><FlaskConical className="w-3.5 h-3.5" /></Button>
      )}
      <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={onDelete} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

// ── Finished Goods Table (grouped by bottle size, then by product) ──────────
function FinishedGoodsTable({ finishedGoods, loading, onOpen }) {
  const [expanded, setExpanded] = useState({});

  // Normalise product name — strip doubled and trailing size suffixes for grouping
  const normFGName = (name) => (name || '').trim()
    .replace(/(\s*\d{3,4}ml)\s*\1/gi, '')
    .replace(/\s*\d{3,4}ml\s*$/i, '').trim();

  // First group by bottle_size_ml, then by NORMALISED product_name within each size
  // This merges "London Dry Gin 200ml" and "London Dry Gin 200ml 200ml" into one group
  const bySize = {};
  finishedGoods.filter(g => (g.quantity_bottles || 0) > 0).forEach(g => {
    const sizeKey = g.bottle_size_ml ?? 'no-size';
    if (!bySize[sizeKey]) bySize[sizeKey] = {};

    // Use normalised name as grouping key but display the canonical (shorter) name
    const normKey = normFGName(g.product_name) || 'Unknown';
    if (!bySize[sizeKey][normKey]) {
      bySize[sizeKey][normKey] = { product_name: normKey, bottle_size_ml: g.bottle_size_ml, abv_percent: g.abv_percent, batches: [] };
    }
    const existing = bySize[sizeKey][normKey].batches.find(b => b.batch_number === g.batch_number);
    if (existing) {
      existing.quantity_bottles += (g.quantity_bottles || 0);
      existing.total_lals += (g.total_lals || 0);
    } else {
      bySize[sizeKey][normKey].batches.push({ ...g, product_name: normKey, quantity_bottles: g.quantity_bottles || 0, total_lals: g.total_lals || 0 });
    }
  });

  const sizeOrder = [700, 200]; // Display 700ml first, then 200ml
  const sizes = Object.keys(bySize)
    .sort((a, b) => {
      const aNum = a === 'no-size' ? Infinity : parseInt(a);
      const bNum = b === 'no-size' ? Infinity : parseInt(b);
      return sizeOrder.indexOf(aNum) !== -1 && sizeOrder.indexOf(bNum) !== -1 
        ? sizeOrder.indexOf(aNum) - sizeOrder.indexOf(bNum)
        : aNum - bNum;
    });

  const toggle = key => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6"></TableHead>
              <TableHead>Bottle Size</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>ABV</TableHead>
              <TableHead>Total Bottles</TableHead>
              <TableHead>Total LALs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : sizes.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No finished goods in stock</TableCell></TableRow>
            ) : sizes.flatMap(sizeKey => {
              const sizeGroup = bySize[sizeKey];
              const products = Object.entries(sizeGroup);
              
              return [
                // Size header row (collapsible)
                <TableRow key={`size-${sizeKey}`} className="bg-accent/20 hover:bg-accent/30 cursor-pointer font-bold" onClick={() => toggle(`size-${sizeKey}`)}>
                  <TableCell className="w-6 pr-0">
                    {expanded[`size-${sizeKey}`] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </TableCell>
                  <TableCell className="font-bold text-sm">{sizeKey === 'no-size' ? 'No Size' : `${sizeKey}ml`}</TableCell>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    {products.length} product{products.length !== 1 ? 's' : ''} · {products.reduce((s, [, p]) => s + p.batches.reduce((bs, b) => bs + (b.quantity_bottles || 0), 0), 0)} total bottles
                  </TableCell>
                </TableRow>,
                // Product rows (nested under size)
                ...(expanded[`size-${sizeKey}`] ? products.flatMap(([prodKey, prodGroup]) => {
                  const prodKey2 = `${sizeKey}||${prodKey}`;
                  const totalBottles = prodGroup.batches.reduce((s, b) => s + (b.quantity_bottles || 0), 0);
                  const totalLals = prodGroup.batches.reduce((s, b) => s + (b.total_lals || 0), 0);
                  
                  return [
                    <TableRow key={prodKey2} className="cursor-pointer hover:bg-muted/50" onClick={() => toggle(prodKey2)}>
                      <TableCell className="w-6 pr-0 pl-6">
                        {prodGroup.batches.length > 0 && (expanded[prodKey2] ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
                      </TableCell>
                      <TableCell className="text-sm"></TableCell>
                      <TableCell className="font-semibold text-sm">{prodKey}</TableCell>
                      <TableCell className="text-sm">{prodGroup.abv_percent ? `${prodGroup.abv_percent}%` : '—'}</TableCell>
                      <TableCell className="text-sm font-bold text-primary">{totalBottles}</TableCell>
                      <TableCell className="text-sm font-semibold">{totalLals.toFixed(3)}</TableCell>
                    </TableRow>,
                    // Batch rows (nested under product)
                    ...(expanded[prodKey2] ? prodGroup.batches.map(b => (
                      <TableRow key={b.id} className="bg-muted/30">
                        <TableCell />
                        <TableCell></TableCell>
                        <TableCell className="text-sm text-muted-foreground pl-12">↳ {b.batch_number}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.abv_percent ? `${b.abv_percent}%` : '—'}</TableCell>
                        <TableCell className="text-sm">{b.quantity_bottles}</TableCell>
                        <TableCell className="text-sm">{b.total_lals?.toFixed(3) || '—'}</TableCell>
                        <TableCell>
                          <Actions
                            onAdjust={() => onOpen('adjust', b, 'FinishedGood', 'finishedGoods')}
                            onEdit={() => onOpen('edit', b, 'FinishedGood', 'finishedGoods')}
                            onDelete={() => onOpen('delete', b, 'FinishedGood', 'finishedGoods')}
                            onMoveToTasting={() => onOpen('moveToTasting', b, 'FinishedGood', 'finishedGoods')}
                            isTasting={b.is_tasting === true || (b.product_name || '').includes('Tasting')}
                          />
                        </TableCell>
                      </TableRow>
                    )) : [])
                  ];
                }) : [])
              ];
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}


// ── Low Stock Alerts Component ───────────────────────────────────────────────
function LowStockAlerts({ rawMaterials, thresholds }) {
  const qc = useQueryClient();

  const setMutation = useMutation({
    mutationFn: async ({ materialId, materialName, unit, threshold }) => {
      const existing = thresholds.find(t => t.raw_material_id === materialId);
      if (threshold === '' || parseFloat(threshold) <= 0) {
        if (existing) await base44.entities.StockThreshold.delete(existing.id);
        return;
      }
      if (existing) {
        await base44.entities.StockThreshold.update(existing.id, { threshold: parseFloat(threshold) });
      } else {
        await base44.entities.StockThreshold.create({
          raw_material_id: materialId,
          material_name: materialName,
          threshold: parseFloat(threshold),
          unit,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stockThresholds'] }),
    onError: (err) => toast.error(err.message || 'Failed to save stock threshold'),
  });

  const alertItems = rawMaterials
    .map(m => {
      const t = thresholds.find(th => th.raw_material_id === m.id);
      const isLow = t && (m.quantity || 0) <= t.threshold;
      return { ...m, threshold: t?.threshold, isLow };
    })
    .filter(m => m.isLow);

  const allItems = rawMaterials.filter(m => m.type !== 'packaging');

  return (
    <div className="space-y-6">
      {/* Current alerts */}
      {alertItems.length > 0 && (
        <Card className="border-amber-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border-b border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">{alertItems.length} item{alertItems.length !== 1 ? 's' : ''} below minimum stock level</p>
          </div>
          <div className="divide-y divide-border">
            {alertItems.map(m => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.type}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-destructive">{m.quantity?.toFixed(2)} {m.unit}</p>
                  <p className="text-xs text-muted-foreground">min: {m.threshold} {m.unit}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {alertItems.length === 0 && thresholds.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <Bell className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-800">All items are above their minimum stock levels</p>
        </div>
      )}

      {/* Set thresholds table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-semibold">Set minimum stock levels</p>
          <p className="text-xs text-muted-foreground mt-0.5">Leave blank to disable alerts for that item</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Current stock</TableHead>
                <TableHead>Minimum level</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allItems.map(m => {
                const t = thresholds.find(th => th.raw_material_id === m.id);
                const isLow = t && (m.quantity || 0) <= t.threshold;
                return (
                  <TableRow key={m.id} className={isLow ? 'bg-amber-50/50' : ''}>
                    <TableCell className="font-medium text-sm">{m.name}</TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">{m.type}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className={isLow ? 'text-destructive font-semibold' : ''}>
                        {m.quantity?.toFixed(2)} {m.unit}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={t?.threshold ?? ''}
                          placeholder="e.g. 50"
                          className="h-8 w-28 text-sm"
                          onBlur={e => {
                            const val = e.target.value;
                            if (val !== String(t?.threshold ?? '')) {
                              setMutation.mutate({
                                materialId: m.id,
                                materialName: m.name,
                                unit: m.unit,
                                threshold: val,
                              });
                            }
                          }}
                        />
                        <span className="text-xs text-muted-foreground">{m.unit}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {!t ? (
                        <span className="text-xs text-muted-foreground">No alert set</span>
                      ) : isLow ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Low stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          ✓ OK
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
function RawMaterialRow({ m, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const lots = Array.isArray(m.lots) && m.lots.length > 0
    ? [...m.lots].sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''))
    : null;
  const hasLots = lots && lots.length > 0;
  return (
    <>
      <TableRow className="hover:bg-muted/30">
        <TableCell className="font-medium text-sm">
          <div className="flex items-center gap-2">
            {hasLots
              ? <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              : <span className="w-3.5 inline-block" />}
            {m.name}
            {hasLots && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">{lots.length} lot{lots.length !== 1 ? 's' : ''}</span>}
          </div>
        </TableCell>
        <TableCell><Badge variant="secondary" className={typeColors[m.type] || typeColors.other}>{m.type}</Badge></TableCell>
        <TableCell className="text-sm font-semibold">{(m.quantity || 0).toFixed ? Number(m.quantity || 0).toFixed(3) : m.quantity} {m.unit}</TableCell>
        <TableCell className="text-sm">{m.abv_percent ? `${m.abv_percent}%` : '—'}</TableCell>
        <TableCell className="text-sm font-medium">{m.lals ? m.lals.toFixed(3) : '—'}</TableCell>
        <TableCell className="text-sm">{m.supplier || '—'}</TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {hasLots
            ? <span className="text-blue-600 text-xs cursor-pointer hover:underline" onClick={() => setExpanded(v => !v)}>
                {expanded ? 'hide' : `${lots.length} lot${lots.length !== 1 ? 's' : ''}`}
              </span>
            : (m.batch_number || '—')}
        </TableCell>
        <TableCell>
          <Actions
            onAdjust={() => onOpen('adjust', m, 'RawMaterial', 'rawMaterials')}
            onEdit={() => onOpen('edit', m, 'RawMaterial', 'rawMaterials')}
            onDelete={() => onOpen('delete', m, 'RawMaterial', 'rawMaterials')}
          />
        </TableCell>
      </TableRow>
      {expanded && lots && (
        <TableRow>
          <TableCell colSpan={8} className="p-0 bg-blue-50/40">
            <div className="px-10 py-2">
              <p className="text-xs font-semibold text-blue-700 mb-1.5 uppercase tracking-wide">Lot history — FIFO (oldest used first →)</p>
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground border-b border-blue-200">
                  <th className="text-left py-1 pr-3">Lot / Batch #</th>
                  <th className="text-left py-1 pr-3">Date received</th>
                  <th className="text-left py-1 pr-3">Supplier</th>
                  <th className="text-right py-1 pr-3">Received</th>
                  <th className="text-right py-1 pr-3">Remaining</th>
                  <th className="text-right py-1">Used</th>
                </tr></thead>
                <tbody>
                  {lots.map((lot, idx) => {
                    const used = (lot.quantity_received || 0) - (lot.quantity_remaining || 0);
                    const isEmpty = (lot.quantity_remaining || 0) <= 0;
                    return (
                      <tr key={idx} className={isEmpty ? 'text-muted-foreground/50' : ''}>
                        <td className="py-1 pr-3 font-medium">
                          {idx === 0 && !isEmpty && <span className="text-amber-600 mr-1">→</span>}
                          {lot.lot_number || '(no lot #)'}
                          {isEmpty && <span className="ml-1 text-muted-foreground">(depleted)</span>}
                        </td>
                        <td className="py-1 pr-3">{lot.date_received || '—'}</td>
                        <td className="py-1 pr-3">{lot.supplier || '—'}</td>
                        <td className="py-1 pr-3 text-right">{(lot.quantity_received || 0).toFixed(3)} {m.unit}</td>
                        <td className={`py-1 pr-3 text-right font-semibold ${isEmpty ? 'text-muted-foreground/50' : 'text-emerald-700'}`}>{(lot.quantity_remaining || 0).toFixed(3)} {m.unit}</td>
                        <td className="py-1 text-right text-muted-foreground">{used.toFixed(3)} {m.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function Inventory() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null); // { type: 'adjust'|'edit'|'delete', item, entity, queryKey }
  const [rawPage, setRawPage] = useState(1);
  const [rawPageSize, setRawPageSize] = useState(50);
  const [pkgPage, setPkgPage] = useState(1);
  const [pkgPageSize, setPkgPageSize] = useState(50);

  const {
    rawMaterialsWithNetStock: rawMaterialsWithNetStockFromHook,
    isLoading: loadingRaw,
    spiritRecipes,
    packagingRecipes,
    botanicalConsumedByName,
    packagingConsumedByName,
    receivedByName,
    totalBottlesBottled700,
    totalBottlesBottled200,
  } = useRawMaterialsNetStock();
  const rawMaterials = rawMaterialsWithNetStockFromHook;

  const { data: distillationRuns = [] } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 5000),
  });

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => base44.entities.BottlingRun.list('-date', 5000),
  });

  const { data: dilutions = [] } = useQuery({
    queryKey: ['dilutions'],
    queryFn: () => base44.entities.Dilution.list('-date', 5000),
  });

  const { data: finishedGoods = [], isLoading: loadingFinished } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('product_name', 5000),
  });

  const { data: thresholds = [] } = useQuery({
    queryKey: ['stockThresholds'],
    queryFn: async () => { try { return await base44.entities.StockThreshold.list('material_name', 5000); } catch { return []; } },
  });

  const { data: allReceivings = [] } = useQuery({
    queryKey: ['receivings'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 5000),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 5000),
  });

  // quantity_bottles on each FinishedGood record is already the correct post-dispatch figure.
  // No dispatch subtraction is needed here — doing so would double-count.
  const rawMaterialsWithNetStock = rawMaterialsWithNetStockFromHook;

  const packagingItems = rawMaterialsWithNetStock.filter(m => m.type?.toLowerCase() === 'packaging');
  const nonPackagingRaw = rawMaterialsWithNetStock.filter(m => m.type?.toLowerCase() !== 'packaging');
  const pagedRaw = nonPackagingRaw.slice((rawPage - 1) * rawPageSize, rawPage * rawPageSize);
  const pagedPkg = packagingItems.slice((pkgPage - 1) * pkgPageSize, pkgPage * pkgPageSize);
  const totalEthanolLALs = rawMaterialsWithNetStock.filter(m => m.type === 'ethanol').reduce((s, m) => s + (m.lals || 0), 0);
  const totalBottles = finishedGoods.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
  const totalFinishedLALs = finishedGoods.reduce((s, g) => s + (g.total_lals || 0), 0);

  const [tastingDialog, setTastingDialog] = useState(null);

  const moveToTastingMutation = useMutation({
    mutationFn: async ({ item, qty }) => {
      const moveQty = parseInt(qty);
      if (!moveQty || moveQty <= 0) throw new Error('Enter a valid quantity');
      if (moveQty > (item.quantity_bottles || 0)) throw new Error('Not enough stock');
      const lalsPerBottle = (item.quantity_bottles > 0 && item.total_lals)
        ? item.total_lals / item.quantity_bottles : 0;
      const moveLals = parseFloat((moveQty * lalsPerBottle).toFixed(4));
      // Deduct from source
      await base44.entities.FinishedGood.update(item.id, {
        quantity_bottles: item.quantity_bottles - moveQty,
        total_lals: parseFloat(((item.total_lals || 0) - moveLals).toFixed(4)),
      });
      // Find or create tasting record
      const allFG = await base44.entities.FinishedGood.list('product_name', 5000);
      const tastingName = item.product_name + ' — Tasting';
      const existing = allFG.find(g =>
        g.product_name === tastingName &&
        g.batch_number === item.batch_number &&
        Number(g.bottle_size_ml) === Number(item.bottle_size_ml)
      );
      if (existing) {
        await base44.entities.FinishedGood.update(existing.id, {
          quantity_bottles: (existing.quantity_bottles || 0) + moveQty,
          total_lals: parseFloat(((existing.total_lals || 0) + moveLals).toFixed(4)),
        });
      } else {
        await base44.entities.FinishedGood.create({
          product_name: tastingName,
          batch_number: item.batch_number,
          bottle_size_ml: item.bottle_size_ml,
          abv_percent: item.abv_percent,
          quantity_bottles: moveQty,
          total_lals: moveLals,
          is_tasting: true,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      toast.success('Bottles moved to tasting stock');
      setTastingDialog(null);
    },
    onError: (e) => toast.error(e.message || 'Failed'),
  });

  const open = (type, item, entity, queryKey) => {
    if (type === 'moveToTasting') { setTastingDialog({ item, qty: '1' }); return; }
    setDialog({ type, item, entity, queryKey });
  };
  const close = () => setDialog(null);

  const rawFields = [
    { key: 'name', label: 'Name', full: true },
    { key: 'type', label: 'Type', type: 'select', options: ['ethanol','botanical','grain','sugar','water','flavoring','packaging','other'] },
    { key: 'supplier', label: 'Supplier' },
    { key: 'batch_number', label: 'Batch #' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'unit', label: 'Unit', type: 'select', options: ['litres','kg','units'] },
    { key: 'abv_percent', label: 'ABV %', type: 'number' },
    { key: 'lals', label: 'LALs', type: 'number' },
    { key: 'cost_per_unit', label: 'Cost/Unit', type: 'number' },
    { key: 'notes', label: 'Notes', full: true },
  ];

  const finishedFields = [
    { key: 'product_name', label: 'Product Name', full: true },
    { key: 'batch_number', label: 'Batch #' },
    { key: 'bottle_size_ml', label: 'Bottle Size (ml)', type: 'number' },
    { key: 'abv_percent', label: 'ABV %', type: 'number' },
    { key: 'quantity_bottles', label: 'Bottles', type: 'number' },
    { key: 'total_lals', label: 'Total LALs', type: 'number' },
    { key: 'notes', label: 'Notes', full: true },
  ];

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Track all raw materials and finished goods" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Raw Materials" value={nonPackagingRaw.length} subtitle="items" icon={Warehouse} />
        <StatCard title="Packaging Items" value={packagingItems.length} subtitle="item types" icon={Package} />
        <StatCard title="Ethanol LALs" value={totalEthanolLALs.toFixed(2)} subtitle="in stock" icon={Warehouse} />
        <StatCard title="Finished Bottles" value={totalBottles} subtitle="in stock" icon={Wine} />
        <StatCard title="Finished LALs" value={totalFinishedLALs.toFixed(2)} subtitle="bottled" icon={Wine} />
      </div>

      <Tabs defaultValue="raw" className="space-y-4">
        <TabsList>
          <TabsTrigger value="raw">Raw Materials</TabsTrigger>
          <TabsTrigger value="packaging">Packaging</TabsTrigger>
          <TabsTrigger value="finished">Finished Goods</TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" />
            Low Stock Alerts
          </TabsTrigger>
          <TabsTrigger value="reconcile" className="flex items-center gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Reconcile
          </TabsTrigger>
        </TabsList>

        {/* Raw Materials */}
        <TabsContent value="raw">
          <Card className="overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>ABV</TableHead>
                    <TableHead>LALs</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRaw ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : nonPackagingRaw.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No raw materials in stock</TableCell></TableRow>
                  ) : pagedRaw.map(m => (
                    <RawMaterialRow key={m.id} m={m} onOpen={open} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <MobileCardGrid>
              {loadingRaw ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
              ) : nonPackagingRaw.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No raw materials in stock</p>
              ) : pagedRaw.map(m => (
                <MobileCard
                  key={m.id}
                  title={m.name}
                  subtitle={m.supplier || '—'}
                  badge={<Badge variant="secondary" className={typeColors[m.type] || typeColors.other}>{m.type}</Badge>}
                  accent={<span className="text-sm font-bold">{m.quantity} {m.unit}</span>}
                  actions={
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('adjust', m, 'RawMaterial', 'rawMaterials')}><SlidersHorizontal className="w-3.5 h-3.5" /> Adjust</Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('edit', m, 'RawMaterial', 'rawMaterials')}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => open('delete', m, 'RawMaterial', 'rawMaterials')}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </>
                  }
                >
                  <MobileDetailRow label="ABV" value={m.abv_percent ? `${m.abv_percent}%` : '—'} />
                  <MobileDetailRow label="LALs" value={m.lals ? m.lals.toFixed(3) : '—'} highlight />
                  <MobileDetailRow label="Batch" value={m.batch_number || '—'} />
                </MobileCard>
              ))}
            </MobileCardGrid>
            <Pagination total={nonPackagingRaw.length} page={rawPage} pageSize={rawPageSize} onPageChange={setRawPage} onPageSizeChange={(s) => { setRawPageSize(s); setRawPage(1); }} />
          </Card>
        </TabsContent>

        {/* Packaging */}
        <TabsContent value="packaging">
          <Card className="overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRaw ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : packagingItems.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No packaging items in stock.</TableCell></TableRow>
                  ) : pagedPkg.map(m => (
                    <RawMaterialRow key={m.id} m={m} onOpen={open} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <MobileCardGrid>
              {loadingRaw ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
              ) : packagingItems.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No packaging items in stock</p>
              ) : pagedPkg.map(m => (
                <MobileCard
                  key={m.id}
                  title={m.name}
                  subtitle={m.supplier || '—'}
                  accent={<span className="text-sm font-bold">{m.quantity} {m.unit}</span>}
                  actions={
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('adjust', m, 'RawMaterial', 'rawMaterials')}><SlidersHorizontal className="w-3.5 h-3.5" /> Adjust</Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('edit', m, 'RawMaterial', 'rawMaterials')}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => open('delete', m, 'RawMaterial', 'rawMaterials')}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </>
                  }
                >
                  <MobileDetailRow label="Batch" value={m.batch_number || '—'} />
                  <MobileDetailRow label="Notes" value={m.notes || '—'} />
                </MobileCard>
              ))}
            </MobileCardGrid>
            <Pagination total={packagingItems.length} page={pkgPage} pageSize={pkgPageSize} onPageChange={setPkgPage} onPageSizeChange={(s) => { setPkgPageSize(s); setPkgPage(1); }} />
          </Card>
        </TabsContent>

        {/* Finished Goods */}
        <TabsContent value="finished">
          <FinishedGoodsTable
            finishedGoods={finishedGoods}
            loading={loadingFinished}
            onOpen={open}
          />
        </TabsContent>
        {/* Low Stock Alerts */}
        <TabsContent value="alerts">
          <LowStockAlerts rawMaterials={rawMaterialsWithNetStock} thresholds={thresholds} />
        </TabsContent>

        <TabsContent value="reconcile">
          <StockReconciliation />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {dialog?.type === 'adjust' && (
        <AdjustDialog item={dialog.item} entity={dialog.entity} queryKey={dialog.queryKey} onClose={close} />
      )}
      {dialog?.type === 'edit' && (
        <EditDialog
          item={dialog.item}
          entity={dialog.entity}
          queryKey={dialog.queryKey}
          fields={dialog.entity === 'FinishedGood' ? finishedFields : rawFields}
          onClose={close}
        />
      )}
      {/* Move to Tasting dialog */}
      {tastingDialog && (
        <Dialog open={!!tastingDialog} onOpenChange={(v) => !v && setTastingDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-amber-500" /> Move to Tasting Stock
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <p className="font-medium">{tastingDialog.item.product_name}</p>
                <p className="text-muted-foreground">Batch {tastingDialog.item.batch_number} · {tastingDialog.item.bottle_size_ml}ml · {tastingDialog.item.quantity_bottles} bottles available</p>
              </div>
              <div>
                <Label>How many bottles to move to tasting?</Label>
                <Input
                  type="number" min="1" max={tastingDialog.item.quantity_bottles}
                  value={tastingDialog.qty}
                  onChange={e => setTastingDialog(d => ({ ...d, qty: e.target.value }))}
                  className="mt-1 text-base h-12 text-center font-bold"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">These bottles will be moved to a separate tasting stock record for this batch.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => moveToTastingMutation.mutate(tastingDialog)}
                  disabled={moveToTastingMutation.isPending || !tastingDialog.qty || parseInt(tastingDialog.qty) <= 0}
                >
                  {moveToTastingMutation.isPending ? 'Moving...' : `Move ${tastingDialog.qty || 0} bottles`}
                </Button>
                <Button variant="outline" onClick={() => setTastingDialog(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {dialog?.type === 'delete' && (
        <DeleteConfirm
          item={dialog.item}
          entity={dialog.entity}
          queryKey={dialog.queryKey}
          label={dialog.entity === 'FinishedGood' ? dialog.item.product_name : dialog.item.name}
          onClose={close}
        />
      )}
    </div>
  );
}