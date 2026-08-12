import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const TEMPLATE_ROWS = [
  'section,batch_code,product_name,date_started,date_completed,target_volume,target_abv,distillation_run_count,total_output_lals,holding_tank,status,ethanol_lot,notes',
  'masterBatch,MB-001,Lactonol Gin,2024-01-01,2024-02-01,200,40,4,80,Tank A,completed,ETH-LOT-001,First batch',
  '',
  'section,sub_batch_code,date,ethanol_lot,botanical_lots,input_volume,input_abv,status',
  'subBatch,MB-001-A,2024-01-05,ETH-LOT-001,Juniper/Coriander,50,96,completed',
  '',
  'section,batch_number,sub_batch_code,date,input_volume,input_abv,input_lals,heads_volume,heads_abv,heads_lals,hearts_volume,hearts_abv,hearts_lals,tails_volume,tails_abv,tails_lals,dumped_volume,dumped_abv,dumped_lals,status',
  'distillationRun,MB-001-A,MB-001-A,2024-01-06,50,96,48,2,85,1.7,40,78,31.2,5,25,1.25,3,60,1.8,completed',
  '',
  'section,batch_number,date,input_volume,input_abv,input_lals,water_added,output_volume,output_abv,output_lals,notes',
  'dilution,MB-001,2024-01-20,80,78,62.4,120,200,40,80,Final dilution',
  '',
  'section,batch_number,date,product_name,input_volume,input_abv,input_lals,bottle_size_ml,bottles_produced,lals_per_bottle,status',
  'bottlingRun,MB-001,2024-02-01,Lactonol Gin,200,40,80,700,280,0.286,completed',
  '',
  'section,batch_number,date,volume_litres,abv_percent,lals,notes',
  'wastage,MB-001-A,2024-01-06,3,60,1.8,Heads and tails dumped',
].join('\n');

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const errors = [];
  const batchData = { masterBatch: null, subBatches: [], distillationRuns: [], dilutions: [], bottlingRun: null, wastageRecords: [] };
  let currentHeaders = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const section = cols[0]?.toLowerCase();
    if (section === 'section') { currentHeaders = cols; continue; }
    const row = {};
    currentHeaders.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    const toNum = (v) => v === '' || v === undefined ? undefined : parseFloat(v);
    if (section === 'masterbatch') {
      batchData.masterBatch = { batch_code: row.batch_code, product_name: row.product_name, date_started: row.date_started || undefined, date_completed: row.date_completed || undefined, target_volume: toNum(row.target_volume), target_abv: toNum(row.target_abv), distillation_run_count: toNum(row.distillation_run_count), total_output_lals: toNum(row.total_output_lals), holding_tank: row.holding_tank || undefined, status: row.status || 'completed', ethanol_lot: row.ethanol_lot || undefined, notes: row.notes || undefined };
    } else if (section === 'subbatch') {
      batchData.subBatches.push({ sub_batch_code: row.sub_batch_code, date: row.date || undefined, ethanol_lot: row.ethanol_lot || undefined, botanical_lots: row.botanical_lots || undefined, input_volume: toNum(row.input_volume), input_abv: toNum(row.input_abv), status: row.status || 'completed' });
    } else if (section === 'distillationrun') {
      batchData.distillationRuns.push({ batch_number: row.batch_number, sub_batch_code: row.sub_batch_code || undefined, date: row.date || undefined, input_volume: toNum(row.input_volume), input_abv: toNum(row.input_abv), input_lals: toNum(row.input_lals), heads_volume: toNum(row.heads_volume), heads_abv: toNum(row.heads_abv), heads_lals: toNum(row.heads_lals), hearts_volume: toNum(row.hearts_volume), hearts_abv: toNum(row.hearts_abv), hearts_lals: toNum(row.hearts_lals), tails_volume: toNum(row.tails_volume), tails_abv: toNum(row.tails_abv), tails_lals: toNum(row.tails_lals), dumped_volume: toNum(row.dumped_volume), dumped_abv: toNum(row.dumped_abv), dumped_lals: toNum(row.dumped_lals), status: row.status || 'completed' });
    } else if (section === 'dilution') {
      batchData.dilutions.push({ batch_number: row.batch_number, date: row.date || undefined, input_volume: toNum(row.input_volume), input_abv: toNum(row.input_abv), input_lals: toNum(row.input_lals), water_added: toNum(row.water_added), output_volume: toNum(row.output_volume), output_abv: toNum(row.output_abv), output_lals: toNum(row.output_lals), notes: row.notes || undefined });
    } else if (section === 'bottlingrun') {
      batchData.bottlingRun = { batch_number: row.batch_number, date: row.date || undefined, product_name: row.product_name, input_volume: toNum(row.input_volume), input_abv: toNum(row.input_abv), input_lals: toNum(row.input_lals), bottle_size_ml: toNum(row.bottle_size_ml), bottles_produced: toNum(row.bottles_produced), lals_per_bottle: toNum(row.lals_per_bottle), status: row.status || 'completed' };
    } else if (section === 'wastage') {
      batchData.wastageRecords.push({ batch_number: row.batch_number, date: row.date || undefined, volume_litres: toNum(row.volume_litres), abv_percent: toNum(row.abv_percent), lals: toNum(row.lals), notes: row.notes || undefined });
    }
  }
  if (!batchData.masterBatch) errors.push('No masterBatch row found.');
  else if (!batchData.masterBatch.batch_code) errors.push('masterBatch is missing a batch_code.');
  else if (!batchData.masterBatch.product_name) errors.push('masterBatch is missing a product_name.');
  return { batchData, errors };
}

function ImportPreviewSection({ title, items, columns }) {
  const [open, setOpen] = useState(true);
  if (!items || (Array.isArray(items) && items.length === 0)) return null;
  const rows = Array.isArray(items) ? items : [items];
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-semibold">{title}</span>
          <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>{columns.map(c => <TableHead key={c} className="text-xs">{c}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>{columns.map(c => <TableCell key={c} className="text-xs py-2">{row[c] !== undefined && row[c] !== null && row[c] !== '' ? String(row[c]) : <span className="text-muted-foreground/50">—</span>}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function ImportDataPanel() {
  const queryClient = useQueryClient();
  const [importParsed, setImportParsed] = useState(null);
  const [importErrors, setImportErrors] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importFileRef = useRef(null);

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { batchData, errors } = parseCSV(ev.target.result);
      setImportParsed(batchData);
      setImportErrors(errors);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!importParsed || importErrors.length > 0) return;
    setImporting(true);
    try {
      const { masterBatch, subBatches, distillationRuns, dilutions, bottlingRun, wastageRecords } = importParsed;

      const master = await db.MasterBatch.create({
        batch_code: masterBatch.batch_code,
        product_name: masterBatch.product_name,
        date_started: masterBatch.date_started,
        date_completed: masterBatch.date_completed,
        status: masterBatch.status,
        target_volume: masterBatch.target_volume,
        target_abv: masterBatch.target_abv,
        holding_tank: masterBatch.holding_tank,
        distillation_run_count: masterBatch.distillation_run_count,
        total_output_lals: masterBatch.total_output_lals,
        ethanol_lot: masterBatch.ethanol_lot,
        notes: masterBatch.notes,
      });

      const results = { subBatches: 0, distillationRuns: 0, dilutions: 0, wastageRecords: 0 };

      for (const sb of subBatches) {
        await db.SubBatch.create({
          master_batch_id: master.id,
          master_batch_code: master.batch_code,
          sub_batch_code: sb.sub_batch_code,
          date: sb.date,
          ethanol_lot: sb.ethanol_lot,
          botanical_lots: sb.botanical_lots,
          input_volume: sb.input_volume,
          input_abv: sb.input_abv,
          status: sb.status,
        });
        results.subBatches++;
      }

      for (const run of distillationRuns) {
        await db.DistillationRun.create({
          batch_number: run.batch_number || master.batch_code,
          sub_batch_code: run.sub_batch_code,
          date: run.date,
          product_name: master.product_name,
          input_volume: run.input_volume,
          input_abv: run.input_abv,
          input_lals: run.input_lals,
          heads_volume: run.heads_volume,
          heads_abv: run.heads_abv,
          heads_lals: run.heads_lals,
          hearts_volume: run.hearts_volume,
          hearts_abv: run.hearts_abv,
          hearts_lals: run.hearts_lals,
          tails_volume: run.tails_volume,
          tails_abv: run.tails_abv,
          tails_lals: run.tails_lals,
          dumped_volume: run.dumped_volume,
          dumped_abv: run.dumped_abv,
          dumped_lals: run.dumped_lals,
          status: run.status,
        });
        results.distillationRuns++;
      }

      for (const d of dilutions) {
        await db.Dilution.create({
          batch_number: d.batch_number || master.batch_code,
          date: d.date,
          input_ethanol_volume: d.input_volume,
          input_abv: d.input_abv,
          input_lals: d.input_lals,
          water_added: d.water_added,
          output_volume: d.output_volume,
          output_abv: d.output_abv,
          output_lals: d.output_lals,
          status: d.status,
          notes: d.notes,
        });
        results.dilutions++;
      }

      if (bottlingRun) {
        await db.BottlingRun.create({
          batch_number: bottlingRun.batch_number || master.batch_code,
          product_name: bottlingRun.product_name || master.product_name,
          date: bottlingRun.date,
          input_volume: bottlingRun.input_volume,
          input_abv: bottlingRun.input_abv,
          input_lals: bottlingRun.input_lals,
          bottle_size_ml: bottlingRun.bottle_size_ml,
          bottles_produced: bottlingRun.bottles_produced,
          lals_per_bottle: bottlingRun.lals_per_bottle,
          status: bottlingRun.status,
        });
      }

      for (const w of wastageRecords) {
        await db.WastageRecord.create({
          date: w.date,
          batch_number: w.batch_number || master.batch_code,
          product_name: master.product_name,
          volume: w.volume_litres,
          abv: w.abv_percent,
          lals: w.lals,
          notes: w.notes,
          source: 'csv_import',
        });
        results.wastageRecords++;
      }

      queryClient.invalidateQueries({ queryKey: ['masterBatches'] });
      queryClient.invalidateQueries({ queryKey: ['subBatches'] });
      queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['dilutions'] });
      queryClient.invalidateQueries({ queryKey: ['bottlingRuns'] });
      queryClient.invalidateQueries({ queryKey: ['wastageRecords'] });

      setImportResult({ success: true, batch_code: master.batch_code, results });
      toast.success('Batch ' + master.batch_code + ' imported successfully');
      setImportParsed(null);
      setImportFileName('');
    } catch (err) {
      setImportResult({ success: false, error: err.message });
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => { setImportParsed(null); setImportErrors([]); setImportFileName(''); setImportResult(null); };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_ROWS], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'distilflow_batch_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Batch Data</CardTitle>
        <CardDescription>Upload historical batch data via CSV</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-sm font-semibold text-blue-800 mb-2">How to use</p>
          <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
            <li>Download the template and fill in your historical data</li>
            <li>Each section starts with a header row beginning with "section"</li>
            <li>Upload your CSV to see a preview before anything is saved</li>
            <li>Review and click Import to save the batch</li>
          </ol>
        </div>
        <Button variant="outline" className="gap-2" onClick={downloadTemplate}>
          <Download className="w-4 h-4" /> Download Template
        </Button>

        {importResult?.success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <p className="font-semibold text-emerald-800">Batch {importResult.batch_code} imported successfully</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[['Sub Batches', importResult.results?.subBatches], ['Distillation Runs', importResult.results?.distillationRuns], ['Dilutions', importResult.results?.dilutions], ['Wastage Records', importResult.results?.wastageRecords]].map(([label, val]) => (
                <div key={label} className="rounded-lg bg-white border border-emerald-200 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-emerald-700">{val ?? 0}</p>
                  <p className="text-xs text-emerald-600">{label}</p>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-4" onClick={resetImport}>Import another batch</Button>
          </div>
        )}

        {importResult?.success === false && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 mb-2"><XCircle className="w-5 h-5 text-destructive" /><p className="font-semibold text-destructive">Import failed</p></div>
            <p className="text-sm text-destructive/80">{importResult.error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={resetImport}>Try again</Button>
          </div>
        )}

        {!importParsed && !importResult && (
          <div className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer p-10 text-center" onClick={() => importFileRef.current?.click()}>
            <input ref={importFileRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">Click to upload your CSV file</p>
            <p className="text-sm text-muted-foreground/60 mt-1">One batch per file · .csv only</p>
          </div>
        )}

        {importErrors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-600" /><p className="text-sm font-semibold text-amber-800">Fix these issues before importing</p></div>
            <ul className="space-y-1">{importErrors.map((e, i) => <li key={i} className="text-sm text-amber-700">• {e}</li>)}</ul>
            <Button variant="outline" size="sm" className="mt-3" onClick={resetImport}>Upload different file</Button>
          </div>
        )}

        {importParsed && importErrors.length === 0 && !importResult && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{importFileName}</span>
                <Badge className="bg-emerald-100 text-emerald-800 text-xs">Ready to import</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={resetImport}>Change file</Button>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-semibold mb-3">{importParsed.masterBatch?.batch_code} — {importParsed.masterBatch?.product_name}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[['Sub Batches', importParsed.subBatches?.length], ['Distillation Runs', importParsed.distillationRuns?.length], ['Dilutions', importParsed.dilutions?.length], ['Bottling Run', importParsed.bottlingRun ? 'Yes' : 'No']].map(([label, val]) => (
                  <div key={label} className="rounded-lg bg-white border border-primary/10 px-3 py-2 text-center">
                    <p className="text-lg font-bold text-primary">{val}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>
            <ImportPreviewSection title="Master Batch" items={importParsed.masterBatch} columns={['batch_code','product_name','date_started','date_completed','target_volume','target_abv','status']} />
            <ImportPreviewSection title="Sub Batches" items={importParsed.subBatches} columns={['sub_batch_code','date','ethanol_lot','botanical_lots','input_volume','input_abv','status']} />
            <ImportPreviewSection title="Distillation Runs" items={importParsed.distillationRuns} columns={['batch_number','date','input_volume','input_abv','hearts_volume','hearts_abv','hearts_lals','status']} />
            <ImportPreviewSection title="Dilutions" items={importParsed.dilutions} columns={['batch_number','date','input_volume','input_abv','water_added','output_volume','output_abv','output_lals']} />
            <ImportPreviewSection title="Bottling Run" items={importParsed.bottlingRun} columns={['batch_number','date','product_name','bottle_size_ml','bottles_produced','lals_per_bottle','status']} />
            <ImportPreviewSection title="Wastage Records" items={importParsed.wastageRecords} columns={['batch_number','date','volume_litres','abv_percent','lals','notes']} />
            <div className="flex gap-3 pt-2">
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" />Importing…</> : <><CheckCircle2 className="w-4 h-4" />Import Batch</>}
              </Button>
              <Button variant="outline" onClick={resetImport} disabled={importing}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
