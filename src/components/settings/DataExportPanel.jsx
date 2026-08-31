import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, Download, Loader2, CheckCircle2, AlertCircle, FileJson } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// Every data entity in the app — each is fetched and bundled into the backup.
const ENTITY_NAMES = [
  'DistillationRun', 'SNSRun', 'BottlingRun', 'Dilution', 'SubBatch', 'MasterBatch',
  'StorageTank', 'TankMovement', 'FinishedGood', 'RawMaterial', 'Receiving',
  'WarehouseStock', 'StockTake', 'StockTakeLine', 'WhiskeyBarrel',
  'Dispatch', 'Customer', 'Supplier', 'Recipe',
  'WastageRecord', 'UtilityLog',
  'MaintenanceRecord', 'PestControlTrap', 'PestControlLog', 'TemperatureLog',
  'FoodRecall', 'MockRecall', 'AppSettings', 'DashboardLink', 'User',
];

export default function DataExportPanel() {
  const [data, setData] = useState({});       // { EntityName: records[] }
  const [status, setStatus] = useState({});    // { EntityName: 'loading'|'ready'|'error' }
  const [selected, setSelected] = useState(() => Object.fromEntries(ENTITY_NAMES.map(n => [n, true])));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ENTITY_NAMES.forEach(async (name) => {
      setStatus(s => ({ ...s, [name]: 'loading' }));
      try {
        const records = await base44.entities[name].list('-created_at', 5000);
        if (cancelled) return;
        setData(d => ({ ...d, [name]: records }));
        setStatus(s => ({ ...s, [name]: 'ready' }));
      } catch {
        if (cancelled) return;
        setStatus(s => ({ ...s, [name]: 'error' }));
      }
    });
    return () => { cancelled = true; };
  }, []);

  const rows = ENTITY_NAMES.map(name => ({
    name,
    count: data[name]?.length || 0,
    status: status[name] || 'loading',
  }));

  const totalRecords = rows.reduce((s, r) => s + r.count, 0);
  const totalEntitiesReady = rows.filter(r => r.status === 'ready').length;
  const selectedRecords = rows.filter(r => selected[r.name]).reduce((s, r) => s + r.count, 0);
  const selectedEntities = rows.filter(r => selected[r.name]).length;
  const allSelected = ENTITY_NAMES.every(n => selected[n]);

  const toggleAll = (val) => setSelected(Object.fromEntries(ENTITY_NAMES.map(n => [n, val])));

  const handleExport = () => {
    const chosen = ENTITY_NAMES.filter(n => selected[n] && data[n]);
    if (chosen.length === 0) { toast.warning('Select at least one entity to export.'); return; }
    setExporting(true);
    try {
      const backup = {
        exported_at: new Date().toISOString(),
        application: 'Congener',
        record_counts: {},
        data: {},
      };
      for (const name of chosen) {
        backup.data[name] = data[name];
        backup.record_counts[name] = data[name].length;
      }
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fname = `distillery-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const total = chosen.reduce((s, n) => s + backup.record_counts[n], 0);
      toast.success(`Backup downloaded — ${fname} (${total.toLocaleString()} records, ${chosen.length} entities)`);
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-display font-bold flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" /> Data Export / Backup
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Export every record in the app to a single downloadable JSON file. Run this monthly to keep an offline copy of your data.
            </p>
          </div>
          <Button onClick={handleExport} disabled={exporting || totalEntitiesReady === 0} className="gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? 'Building backup…' : 'Export Backup (JSON)'}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border p-3">
            <div className="flex items-center gap-2 text-muted-foreground"><Database className="w-4 h-4" /><span className="text-xs font-medium">Entities</span></div>
            <p className="text-xl font-bold font-display mt-1">{rows.length}</p>
          </div>
          <div className="rounded-xl border p-3">
            <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="w-4 h-4" /><span className="text-xs font-medium">Loaded</span></div>
            <p className="text-xl font-bold font-display mt-1">{totalEntitiesReady}/{rows.length}</p>
          </div>
          <div className="rounded-xl border p-3">
            <div className="flex items-center gap-2 text-muted-foreground"><FileJson className="w-4 h-4" /><span className="text-xs font-medium">Total Records</span></div>
            <p className="text-xl font-bold font-display mt-1">{totalRecords.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border p-3">
            <div className="flex items-center gap-2 text-muted-foreground"><Download className="w-4 h-4" /><span className="text-xs font-medium">Selected</span></div>
            <p className="text-xl font-bold font-display mt-1">{selectedRecords.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{selectedEntities} entities</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(!!v)} id="select-all-export" />
          <label htmlFor="select-all-export" className="text-sm font-medium cursor-pointer">Select all entities</label>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.name}>
                  <TableCell>
                    <Checkbox checked={!!selected[r.name]} onCheckedChange={(v) => setSelected(s => ({ ...s, [r.name]: !!v }))} />
                  </TableCell>
                  <TableCell className="font-medium text-sm">{r.name}</TableCell>
                  <TableCell className="text-right text-sm">
                    {r.status === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : r.count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'ready' && <span className="text-xs text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>}
                    {r.status === 'loading' && <span className="text-xs text-muted-foreground">Loading…</span>}
                    {r.status === 'error' && <span className="text-xs text-destructive inline-flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Error</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}