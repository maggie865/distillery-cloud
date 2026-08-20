import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, ClipboardCheck, CheckCircle2, Trash2, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, Minus, Package, Wine, Droplets } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import Pagination from '@/components/ui/Pagination';

const CATEGORY_META = {
  raw_material: { label: 'Raw Materials', icon: Package, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  finished_good: { label: 'Finished Goods', icon: Wine, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  tank: { label: 'Tanks', icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
};

export default function StockTakes() {
  const [newOpen, setNewOpen] = useState(false);
  const [conductedBy, setConductedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [scope, setScope] = useState({ raw_material: true, finished_good: true, tank: true });
  const [activeStockTake, setActiveStockTake] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const queryClient = useQueryClient();

  const { data: stockTakes = [], isLoading } = useQuery({
    queryKey: ['stockTakes'],
    queryFn: () => db.StockTake.list('-date', 5000),
  });

  const { data: allLines = [] } = useQuery({
    queryKey: ['stockTakeLines'],
    queryFn: () => db.StockTakeLine.list('material_name', 5000),
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => db.RawMaterial.list('name', 5000),
  });

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => db.FinishedGood.list('product_name', 5000),
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list('name', 5000),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const stockTake = await db.StockTake.create({
        date: new Date().toISOString().split('T')[0],
        conducted_by: conductedBy || undefined,
        status: 'draft',
        notes: notes || undefined,
      });

      const lines = [];

      if (scope.raw_material) {
        for (const mat of rawMaterials) {
          lines.push({
            stock_take_id: stockTake.id, item_type: 'raw_material',
            raw_material_id: mat.id,
            material_name: mat.name,
            unit: mat.unit,
            system_quantity: mat.quantity || 0,
          });
        }
      }

      if (scope.finished_good) {
        for (const fg of finishedGoods) {
          if ((fg.product_name || '').toLowerCase().includes('tasting')) continue;
          lines.push({
            stock_take_id: stockTake.id, item_type: 'finished_good',
            finished_good_id: fg.id,
            material_name: fg.product_name,
            batch_number: fg.batch_number,
            bottle_size_ml: fg.bottle_size_ml,
            unit: 'bottles',
            system_quantity: fg.quantity_bottles || 0,
          });
        }
      }

      if (scope.tank) {
        for (const tank of tanks) {
          if ((tank.status === 'empty' || !tank.current_volume) && !tank.current_product) continue;
          lines.push({
            stock_take_id: stockTake.id, item_type: 'tank',
            tank_id: tank.id,
            material_name: `Tank ${tank.name}${tank.current_product ? ' — ' + tank.current_product : ''}`,
            unit: 'litres',
            system_quantity: tank.current_volume || 0,
          });
        }
      }

      for (const line of lines) {
        await db.StockTakeLine.create(line);
      }

      return stockTake;
    },
    onSuccess: (stockTake) => {
      queryClient.invalidateQueries({ queryKey: ['stockTakes'] });
      queryClient.invalidateQueries({ queryKey: ['stockTakeLines'] });
      setNewOpen(false);
      setConductedBy('');
      setNotes('');
      setScope({ raw_material: true, finished_good: true, tank: true });
      setActiveStockTake(stockTake.id);
      toast.success('Stock take created — enter your counted quantities');
    },
    onError: (err) => toast.error(err.message || 'Failed to create stock take'),
  });

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, counted, systemQuantity }) => {
      const countedNum = counted !== '' ? parseFloat(counted) : null;
      const variance = countedNum != null ? parseFloat((countedNum - systemQuantity).toFixed(3)) : null;
      return db.StockTakeLine.update(lineId, { counted_quantity: countedNum, variance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockTakeLines'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to save counted quantity'),
  });

  const completeMutation = useMutation({
    mutationFn: (id) => db.StockTake.update(id, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockTakes'] });
      setActiveStockTake(null);
      toast.success('Stock take completed and saved');
    },
    onError: (err) => toast.error(err.message || 'Failed to complete stock take'),
  });

  const applyVariancesMutation = useMutation({
    mutationFn: async (stockTakeId) => {
      // Only apply lines where a count was explicitly entered (variance recorded means user touched it)
      // Guard against Base44 coercing null to 0 by also checking variance is not null
      const lines = allLines.filter(l =>
        l.stock_take_id === stockTakeId &&
        l.counted_quantity != null &&
        l.variance != null
      );
      for (const line of lines) {
        if (line.item_type === 'raw_material' && line.raw_material_id) {
          const mat = rawMaterials.find(m => m.id === line.raw_material_id);
          const update = { quantity: line.counted_quantity };
          if (mat?.abv_percent && mat?.type === 'ethanol') {
            update.lals = parseFloat((line.counted_quantity * mat.abv_percent / 100).toFixed(3));
          }
          await db.RawMaterial.update(line.raw_material_id, update);
        } else if (line.item_type === 'finished_good' && line.finished_good_id) {
          const fg = finishedGoods.find(f => f.id === line.finished_good_id);
          const lalsPerBottle = fg?.total_lals && fg?.quantity_bottles ? fg.total_lals / fg.quantity_bottles : 0;
          const newLals = lalsPerBottle ? parseFloat((line.counted_quantity * lalsPerBottle).toFixed(4)) : 0;
          await db.FinishedGood.update(line.finished_good_id, { quantity_bottles: line.counted_quantity, total_lals: newLals });
        } else if (line.item_type === 'tank' && line.tank_id) {
          const tank = tanks.find(t => t.id === line.tank_id);
          const newLals = tank?.current_abv ? parseFloat((line.counted_quantity * tank.current_abv / 100).toFixed(3)) : 0;
          const update = { current_volume: line.counted_quantity };
          if (tank?.current_abv) update.total_lals = newLals;
          if (line.counted_quantity <= 0) update.status = 'empty';
          await db.StorageTank.update(line.tank_id, update);
        }
      }
      await db.StockTake.update(stockTakeId, { status: 'completed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockTakes'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      setActiveStockTake(null);
      toast.success('Variances applied — inventory updated to counted quantities');
    },
    onError: (err) => toast.error(err.message || 'Failed to apply variances'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const lines = allLines.filter(l => l.stock_take_id === id);
      for (const line of lines) await db.StockTakeLine.delete(line.id);
      await db.StockTake.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockTakes'] });
      queryClient.invalidateQueries({ queryKey: ['stockTakeLines'] });
      setDeletingId(null);
      toast.success('Stock take deleted');
    },
    onError: (err) => toast.error(err.message || 'Failed to delete stock take'),
  });

  const getLinesForTake = (id) => allLines.filter(l => l.stock_take_id === id);

  const pagedStockTakes = stockTakes.slice((page - 1) * pageSize, page * pageSize);

  const getVarianceSummary = (lines) => {
    const counted = lines.filter(l => l.counted_quantity != null);
    const withVariance = counted.filter(l => Math.abs(l.variance || 0) > 0.001);
    return { counted: counted.length, total: lines.length, withVariance: withVariance.length };
  };

  const groupLinesByCategory = (lines) => {
    const groups = { raw_material: [], finished_good: [], tank: [] };
    for (const line of lines) {
      const type = line.item_type || 'raw_material';
      if (groups[type]) groups[type].push(line);
    }
    return groups;
  };

  const VarianceIcon = ({ variance }) => {
    if (variance == null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
    if (Math.abs(variance) < 0.001) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    if (variance > 0) return <TrendingUp className="w-3.5 h-3.5 text-blue-500" />;
    return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
  };

  const varianceColor = (variance) => {
    if (variance == null || Math.abs(variance) < 0.001) return '';
    if (variance > 0) return 'text-blue-600 font-semibold';
    return 'text-destructive font-semibold';
  };

  const renderLineRow = (line) => (
    <TableRow key={line.id} className={line.variance != null && Math.abs(line.variance) > 0.001 ? 'bg-amber-50/50' : ''}>
      <TableCell className="font-medium text-sm">{line.material_name}</TableCell>
      {line.item_type === 'finished_good' && (
        <>
          <TableCell className="text-sm font-mono text-xs">{line.batch_number || '—'}</TableCell>
          <TableCell className="text-sm">{line.bottle_size_ml ? `${line.bottle_size_ml}ml` : '—'}</TableCell>
        </>
      )}
      <TableCell className="text-sm text-muted-foreground">{line.unit}</TableCell>
      <TableCell className="text-sm">{line.system_quantity?.toFixed(3) ?? '—'}</TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.001"
          min="0"
          placeholder="Enter count…"
          defaultValue={line.counted_quantity ?? ''}
          className="h-8 w-32 text-sm"
          onBlur={e => {
            const val = e.target.value;
            // Don't save if field is empty — leave as uncounted
            if (val === '') return;
            if (val !== String(line.counted_quantity ?? '')) {
              updateLineMutation.mutate({ lineId: line.id, counted: val, systemQuantity: line.system_quantity });
            }
          }}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <VarianceIcon variance={line.variance} />
          {line.counted_quantity != null && (
            <span className={`text-sm ${varianceColor(line.variance)}`}>
              {line.variance > 0 ? '+' : ''}{line.variance?.toFixed(3) ?? '—'}
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  const renderLineCard = (line) => (
    <div key={line.id} className={`rounded-xl border p-3 ${line.variance != null && Math.abs(line.variance) > 0.001 ? 'bg-amber-50/50 border-amber-200' : 'bg-card'}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="font-semibold text-sm">{line.material_name}</p>
        <span className="text-xs text-muted-foreground">{line.unit}</span>
      </div>
      {line.item_type === 'finished_good' && (
        <p className="text-xs text-muted-foreground mb-1">{line.batch_number} · {line.bottle_size_ml}ml</p>
      )}
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.001"
          min="0"
          placeholder="Count…"
          defaultValue={line.counted_quantity ?? ''}
          className="h-8 flex-1 text-sm"
          onBlur={e => {
            const val = e.target.value;
            if (val === '') return;
            if (val !== String(line.counted_quantity ?? '')) {
              updateLineMutation.mutate({ lineId: line.id, counted: val, systemQuantity: line.system_quantity });
            }
          }}
        />
        <div className="flex items-center gap-1 text-xs">
          <VarianceIcon variance={line.variance} />
          {line.counted_quantity != null && (
            <span className={varianceColor(line.variance)}>
              {line.variance > 0 ? '+' : ''}{line.variance?.toFixed(3)}
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">System: {line.system_quantity?.toFixed(3) ?? '—'} {line.unit}</p>
    </div>
  );

  const renderCategorySection = (category, lines, isHistory = false) => {
    if (!lines || lines.length === 0) return null;
    const meta = CATEGORY_META[category];
    const Icon = meta.icon;
    return (
      <div key={category} className="mb-4 last:mb-0">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${meta.bg} ${meta.border} border`}>
          <Icon className={`w-4 h-4 ${meta.color}`} />
          <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
          <Badge variant="secondary" className="text-xs">{lines.length} items</Badge>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {category === 'finished_good' && <TableHead>Batch</TableHead>}
                {category === 'finished_good' && <TableHead>Size</TableHead>}
                <TableHead>Unit</TableHead>
                <TableHead>System qty</TableHead>
                {!isHistory && <TableHead>Counted qty</TableHead>}
                {isHistory && <TableHead>Counted qty</TableHead>}
                <TableHead>Variance</TableHead>
                {isHistory && <TableHead>Notes</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(line => isHistory ? (
                <TableRow key={line.id} className={line.variance != null && Math.abs(line.variance) > 0.001 ? 'bg-amber-50/30' : ''}>
                  <TableCell className="text-sm font-medium">{line.material_name}</TableCell>
                  {category === 'finished_good' && <TableCell className="text-sm font-mono text-xs">{line.batch_number || '—'}</TableCell>}
                  {category === 'finished_good' && <TableCell className="text-sm">{line.bottle_size_ml ? `${line.bottle_size_ml}ml` : '—'}</TableCell>}
                  <TableCell className="text-sm text-muted-foreground">{line.unit}</TableCell>
                  <TableCell className="text-sm">{line.system_quantity?.toFixed(3) ?? '—'}</TableCell>
                  <TableCell className="text-sm">{line.counted_quantity?.toFixed(3) ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <VarianceIcon variance={line.variance} />
                      <span className={`text-sm ${varianceColor(line.variance)}`}>
                        {line.counted_quantity != null ? `${line.variance > 0 ? '+' : ''}${line.variance?.toFixed(3)}` : '—'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{line.notes || '—'}</TableCell>
                </TableRow>
              ) : renderLineRow(line))}
            </TableBody>
          </Table>
        </div>
        <MobileCardGrid>
          {lines.map(line => isHistory ? (
            <MobileCard
              key={line.id}
              title={line.material_name}
              subtitle={`${line.unit} · ${line.system_quantity?.toFixed(3) ?? '—'} system`}
              accent={
                <div className="flex items-center gap-1 text-sm">
                  <VarianceIcon variance={line.variance} />
                  {line.counted_quantity != null && (
                    <span className={varianceColor(line.variance)}>
                      {line.variance > 0 ? '+' : ''}{line.variance?.toFixed(3)}
                    </span>
                  )}
                </div>
              }
            >
              <MobileDetailRow label="System Qty" value={`${line.system_quantity?.toFixed(3) ?? '—'} ${line.unit}`} />
              <MobileDetailRow label="Counted" value={line.counted_quantity != null ? `${line.counted_quantity.toFixed(3)} ${line.unit}` : '—'} highlight />
              {line.notes && <MobileDetailRow label="Notes" value={line.notes} />}
            </MobileCard>
          ) : renderLineCard(line))}
        </MobileCardGrid>
      </div>
    );
  };

  const scopeCounts = useMemo(() => ({
    raw_material: scope.raw_material ? rawMaterials.length : 0,
    finished_good: scope.finished_good ? finishedGoods.filter(f => !(f.product_name || '').toLowerCase().includes('tasting')).length : 0,
    tank: scope.tank ? tanks.filter(t => !(t.status === 'empty' && !t.current_product)).length : 0,
  }), [scope, rawMaterials, finishedGoods, tanks]);

  const totalScoped = scopeCounts.raw_material + scopeCounts.finished_good + scopeCounts.tank;

  return (
    <div>
      <PageHeader title="Stock Takes" subtitle="Count raw materials, finished goods, and tank levels — reconcile against system stock">
        <Button onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Stock Take
        </Button>
      </PageHeader>

      {activeStockTake && (() => {
        const lines = getLinesForTake(activeStockTake);
        const summary = getVarianceSummary(lines);
        const grouped = groupLinesByCategory(lines);
        return (
          <Card className="mb-6 border-primary/30 overflow-hidden">
            <div className="bg-primary/5 border-b border-primary/20 px-5 py-4 flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">Stock take in progress</p>
                <p className="text-xs text-muted-foreground">{summary.counted} of {summary.total} items counted · {summary.withVariance} variance{summary.withVariance !== 1 ? 's' : ''} found</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setActiveStockTake(null)}>Hide</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  disabled={applyVariancesMutation.isPending}
                  onClick={() => {
                    const countedLines = allLines.filter(l => l.stock_take_id === activeStockTake && l.counted_quantity != null && l.variance != null);
                    const zeroLines = countedLines.filter(l => l.counted_quantity === 0);
                    const msg = zeroLines.length > 0
                      ? `This will update ${countedLines.length} item(s) to their counted quantities — including ${zeroLines.length} item(s) that will be set to ZERO. Lines you left blank will NOT be changed. Continue?`
                      : `This will update ${countedLines.length} item(s) to their counted quantities. Lines you left blank will NOT be changed. Continue?`;
                    if (confirm(msg)) {
                      applyVariancesMutation.mutate(activeStockTake);
                    }
                  }}
                >
                  {applyVariancesMutation.isPending ? 'Applying…' : 'Apply & Update Inventory'}
                </Button>
                <Button
                  size="sm"
                  disabled={completeMutation.isPending}
                  onClick={() => completeMutation.mutate(activeStockTake)}
                >
                  {completeMutation.isPending ? 'Saving…' : 'Complete (no changes)'}
                </Button>
              </div>
            </div>
            <div className="p-2">
              {renderCategorySection('raw_material', grouped.raw_material)}
              {renderCategorySection('finished_good', grouped.finished_good)}
              {renderCategorySection('tank', grouped.tank)}
            </div>
          </Card>
        );
      })()}

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
        ) : stockTakes.length === 0 ? (
          <Card className="p-10 text-center">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="font-medium text-muted-foreground">No stock takes yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first stock take to start reconciling inventory</p>
          </Card>
        ) : pagedStockTakes.map(st => {
          const lines = getLinesForTake(st.id);
          const summary = getVarianceSummary(lines);
          const isExpanded = expandedId === st.id;
          const isActive = activeStockTake === st.id;

          return (
            <Card key={st.id} className="overflow-hidden">
              <button
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors text-left"
                onClick={() => setExpandedId(isExpanded ? null : st.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{format(new Date(st.date), 'MMM d, yyyy')}</span>
                    <Badge variant="secondary" className={st.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                      {st.status === 'completed' ? 'Completed' : 'Draft'}
                    </Badge>
                    {st.conducted_by && <span className="text-xs text-muted-foreground">by {st.conducted_by}</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-muted-foreground">{summary.counted}/{summary.total} items counted</span>
                    {summary.withVariance > 0 && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="w-3 h-3" /> {summary.withVariance} variance{summary.withVariance !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {st.status === 'draft' && !isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={e => { e.stopPropagation(); setActiveStockTake(st.id); }}
                    >
                      Continue
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={e => { e.stopPropagation(); setDeletingId(st.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && lines.length > 0 && (() => {
                const grouped = groupLinesByCategory(lines);
                return (
                  <div className="border-t border-border p-2">
                    {renderCategorySection('raw_material', grouped.raw_material, true)}
                    {renderCategorySection('finished_good', grouped.finished_good, true)}
                    {renderCategorySection('tank', grouped.tank, true)}
                  </div>
                );
              })()}
            </Card>
          );
        })}
      </div>
      <Pagination total={stockTakes.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={newOpen} onOpenChange={v => { setNewOpen(v); if (!v) { setConductedBy(''); setNotes(''); setScope({ raw_material: true, finished_good: true, tank: true }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" /> New Stock Take
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Choose what to count in this stock take.</p>
            <div className="space-y-2">
              {Object.entries(CATEGORY_META).map(([key, meta]) => {
                const Icon = meta.icon;
                const checked = scope[key];
                const count = scopeCounts[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScope(s => ({ ...s, [key]: !s[key] }))}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${checked ? `${meta.bg} ${meta.border}` : 'border-border opacity-60'}`}
                  >
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">{count} item{count !== 1 ? 's' : ''}</p>
                    </div>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${checked ? `${meta.color} border-current` : 'border-muted-foreground/30'}`}>
                      {checked && <CheckCircle2 className="w-4 h-4" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <div>
              <Label>Conducted by</Label>
              <Input
                value={conductedBy}
                onChange={e => setConductedBy(e.target.value)}
                placeholder="Your name (optional)"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Monthly audit (optional)"
                className="mt-1"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || totalScoped === 0}
            >
              {createMutation.isPending ? 'Creating…' : `Start Stock Take (${totalScoped} items)`}
            </Button>
            {totalScoped === 0 && (
              <p className="text-xs text-destructive text-center">Select at least one category to count</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={v => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stock take?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the stock take and all its counted lines. Inventory quantities will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}