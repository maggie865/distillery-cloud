import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Trash2, Settings as SettingsIcon, User, Cylinder, FlaskConical, MapPin, Upload, Download, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle, ChevronDown, ChevronRight, LayoutDashboard, ShieldCheck, CheckSquare, GripVertical, ClipboardList, Database, Link2 } from 'lucide-react';
import DashboardLinkManager from '@/components/settings/DashboardLinkManager';
import RecipeManager from '@/components/settings/RecipeManager';
import LocationSettings from '@/components/settings/LocationSettings';
import ComplianceSettings from '@/components/settings/ComplianceSettings';
import DataExportPanel from '@/components/settings/DataExportPanel';
import ProductLinksManager from '@/components/settings/ProductLinksManager';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const TANK_PURPOSES = ['maceration_dilution', 'final_product_storage', 'diluted_ethanol', 'ibc', 'spare'];
const TANK_LOCATIONS = ['indoor', 'outdoor'];

const EMPTY_TANK = { name: '', capacity_litres: '', purpose: 'maceration_dilution', location: 'indoor', notes: '' };


// ── Import Data helpers ───────────────────────────────────────────────────────
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


// ── Pest Control Map Settings ─────────────────────────────────────────────────
function PestControlMapSettings() {
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const qc = useQueryClient();

  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 100),
  });

  const mapImageUrl = settings.find(s => s.key === 'pest_map_image')?.value || null;
  const mapSettingId = settings.find(s => s.key === 'pest_map_image')?.id || null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      const uploadedUrl = result?.file_url || result?.url || result?.data?.url
        || result?.data?.file_url || (typeof result === 'string' ? result : null);
      if (!uploadedUrl || typeof uploadedUrl !== 'string') {
        throw new Error('Unexpected upload response: ' + JSON.stringify(result).slice(0, 200));
      }
      // Save to shared AppSettings entity so all users see the floor plan
      if (mapSettingId) {
        await base44.entities.AppSettings.update(mapSettingId, { key: 'pest_map_image', value: uploadedUrl });
      } else {
        await base44.entities.AppSettings.create({ key: 'pest_map_image', value: uploadedUrl });
      }
      qc.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Floor plan saved — go to Pest Control to see it on the map');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove the floor plan image?')) return;
    if (mapSettingId) {
      try { await base44.entities.AppSettings.delete(mapSettingId); } catch {}
    }
    qc.invalidateQueries({ queryKey: ['appSettings'] });
    toast.success('Floor plan removed');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pest control floor plan</CardTitle>
        <CardDescription>
          Upload a photo or diagram of your facility to use as the background on the Pest Control map.
          PNG, JPG or PDF — recommended size 1200×800px or larger.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mapImageUrl ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border overflow-hidden bg-muted/30" style={{ maxHeight: '320px' }}>
              <img src={mapImageUrl} alt="Pest control floor plan" className="w-full h-full object-contain" />
            </div>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.pdf,.svg" className="hidden" onChange={handleUpload} />
                <div className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-input text-sm font-medium hover:bg-accent transition-colors cursor-pointer">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Replace image</>}
                </div>
              </label>
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleRemove}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer block">
            <input type="file" accept=".png,.jpg,.jpeg,.pdf,.svg" className="hidden" onChange={handleUpload} />
            <div className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors p-10 text-center">
              {uploading || saving ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">{uploading ? 'Uploading image…' : 'Saving…'}</p>
                </div>
              ) : (
                <>
                  <MapPin className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="font-medium text-muted-foreground">Click to upload your facility floor plan</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">PNG, JPG, or PDF</p>
                </>
              )}
            </div>
          </label>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user, deleteAccount } = useAuth();
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
      const res = await base44.functions.invoke('importBatchData', { batchData: importParsed });
      if (res.data?.success) {
        setImportResult({ success: true, batch_code: res.data.batch_code, results: res.data.results });
        toast.success('Batch ' + res.data.batch_code + ' imported successfully');
        setImportParsed(null);
        setImportFileName('');
      } else {
        setImportResult({ success: false, error: res.data?.error || 'Unknown error' });
        toast.error('Import failed: ' + (res.data?.error || 'Unknown error'));
      }
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
  const [tankForm, setTankForm] = useState(EMPTY_TANK);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: tanks = [], isLoading: loadingTanks } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => base44.entities.StorageTank.list('name', 100),
  });

  const addTankMutation = useMutation({
    mutationFn: (data) => base44.entities.StorageTank.create({
      ...data,
      capacity_litres: parseFloat(data.capacity_litres),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      setTankForm(EMPTY_TANK);
      toast.success('Tank added successfully');
    },
  });

  const deleteTankMutation = useMutation({
    mutationFn: (id) => base44.entities.StorageTank.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      toast.success('Tank deleted');
    },
  });

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount();
    } catch (error) {
      toast.error('Failed to delete account');
    }
  };

  const handleAddTank = (e) => {
    e.preventDefault();
    if (!tankForm.name || !tankForm.capacity_litres) {
      toast.error('Tank name and capacity are required');
      return;
    }
    addTankMutation.mutate(tankForm);
  };

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Settings" subtitle="Manage account, tanks, and production recipes" />

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-10">
          <TabsTrigger value="account" className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="tanks" className="flex items-center gap-2">
            <Cylinder className="w-4 h-4" />
            <span className="hidden sm:inline">Tanks</span>
          </TabsTrigger>
          <TabsTrigger value="recipes" className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4" />
            <span className="hidden sm:inline">Recipes</span>
          </TabsTrigger>
          <TabsTrigger value="product-links" className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">Product Links</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </TabsTrigger>
          <TabsTrigger value="pestmap" className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            <span className="hidden sm:inline">Pest Map</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Compliance</span>
          </TabsTrigger>
          <TabsTrigger value="checklists" className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4" /> Checklists
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            <span className="hidden sm:inline">Backup</span>
          </TabsTrigger>
        </TabsList>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your user profile details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Name</Label>
                <p className="text-lg font-medium">{user?.full_name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="text-lg font-medium">{user?.email}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Role</Label>
                <p className="text-lg font-medium capitalize">{user?.role}</p>
              </div>
            </CardContent>
          </Card>

          <LocationSettings />

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">Deleting your account will permanently remove all your data from the system.</p>
              <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </CardContent>
          </Card>

          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Your Account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. All your data will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                <Trash2 className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive font-medium">This will delete your account and all associated data.</p>
              </div>
              <div className="flex gap-3 mt-4">
                <AlertDialogCancel asChild>
                  <Button variant="outline">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button variant="destructive" onClick={handleDeleteAccount}>Delete Account</Button>
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* Tanks Tab */}
        <TabsContent value="tanks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add New Tank</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddTank} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Tank Name</Label>
                    <Input
                      value={tankForm.name}
                      onChange={(e) => setTankForm({ ...tankForm, name: e.target.value })}
                      placeholder="e.g. Tank A"
                      required
                    />
                  </div>
                  <div>
                    <Label>Capacity (Litres)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={tankForm.capacity_litres}
                      onChange={(e) => setTankForm({ ...tankForm, capacity_litres: e.target.value })}
                      placeholder="1000"
                      required
                    />
                  </div>
                  <div>
                    <Label>Purpose</Label>
                    <Select value={tankForm.purpose} onValueChange={(val) => setTankForm({ ...tankForm, purpose: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TANK_PURPOSES.map(p => (
                          <SelectItem key={p} value={p}>
                            {p.replace(/_/g, ' ').charAt(0).toUpperCase() + p.replace(/_/g, ' ').slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Select value={tankForm.location} onValueChange={(val) => setTankForm({ ...tankForm, location: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TANK_LOCATIONS.map(l => (
                          <SelectItem key={l} value={l}>
                            {l.charAt(0).toUpperCase() + l.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={tankForm.notes}
                      onChange={(e) => setTankForm({ ...tankForm, notes: e.target.value })}
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={addTankMutation.isPending}>
                  <Plus className="w-4 h-4 mr-2" />
                  {addTankMutation.isPending ? 'Adding...' : 'Add Tank'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div>
            <h3 className="text-lg font-semibold mb-4">Existing Tanks</h3>
            {loadingTanks ? (
              <p className="text-muted-foreground">Loading tanks...</p>
            ) : tanks.length === 0 ? (
              <p className="text-muted-foreground">No tanks yet</p>
            ) : (
              <div className="grid gap-3">
                {tanks.map(tank => (
                  <Card key={tank.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="font-semibold">{tank.name}</p>
                          <p className="text-sm text-muted-foreground">{tank.capacity_litres}L • {tank.purpose.replace(/_/g, ' ')}</p>
                          {tank.notes && <p className="text-xs text-muted-foreground mt-2">{tank.notes}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteTankMutation.mutate(tank.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Recipes Tab */}
        <TabsContent value="recipes" className="space-y-6">
          <RecipeManager />
        </TabsContent>

        {/* Product Links Tab */}
        <TabsContent value="product-links" className="space-y-6">
          <ProductLinksManager />
        </TabsContent>
        {/* Import Tab */}
        <TabsContent value="import" className="space-y-5">
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
                    {[['Sub Batches', importResult.results?.subBatches?.length], ['Distillation Runs', importResult.results?.distillationRuns?.length], ['Dilutions', importResult.results?.dilutions?.length], ['Wastage Records', importResult.results?.wastageRecords?.length]].map(([label, val]) => (
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
        </TabsContent>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-5">
          <DashboardLinkManager />
        </TabsContent>

        {/* Pest Control Map Tab */}
        <TabsContent value="pestmap" className="space-y-5">
          <PestControlMapSettings />
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="space-y-5">
          <ComplianceSettings />
        </TabsContent>

        <TabsContent value="checklists" className="space-y-5">
          <ChecklistManager />
        </TabsContent>

        {/* Backup / Data Export Tab */}
        <TabsContent value="backup" className="space-y-5">
          <DataExportPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Checklist Manager (admin only) ────────────────────────────────────────────
const TEMPLATES_KEY = 'checklist_templates';
const CATEGORY_LABELS = { daily: '📅 Daily', weekly: '📆 Weekly', monthly: '🗓 Monthly', 'odd-jobs': '🔧 Odd Jobs', other: '📋 Other' };

function ChecklistManager() {
  const qc = useQueryClient();
  const [editTemplate, setEditTemplate] = useState(null);

  const { data: settingsRow } = useQuery({
    queryKey: ['checklist-templates'],
    queryFn: async () => {
      const rows = await base44.entities.AppSettings.list('key', 5000);
      return rows.find(r => r.key === TEMPLATES_KEY) || null;
    },
  });

  const templates = useMemo(() => {
    if (!settingsRow?.value) return [];
    try { return JSON.parse(settingsRow.value); } catch { return []; }
  }, [settingsRow]);

  const saveTemplates = async (newTemplates) => {
    const val = JSON.stringify(newTemplates);
    if (settingsRow) {
      await base44.entities.AppSettings.update(settingsRow.id, { value: val });
    } else {
      await base44.entities.AppSettings.create({ key: TEMPLATES_KEY, value: val });
    }
    qc.invalidateQueries({ queryKey: ['checklist-templates'] });
  };

  const handleSave = async (tmpl) => {
    const existing = templates.find(t => t.id === tmpl.id);
    await saveTemplates(existing ? templates.map(t => t.id === tmpl.id ? tmpl : t) : [...templates, tmpl]);
    setEditTemplate(null);
    toast.success(existing ? 'Checklist updated' : 'Checklist created');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this checklist?')) return;
    await saveTemplates(templates.filter(t => t.id !== id));
    toast.success('Checklist deleted');
  };

  const grouped = useMemo(() => {
    const g = {};
    for (const t of templates) { const c = t.category || 'other'; if (!g[c]) g[c] = []; g[c].push(t); }
    return g;
  }, [templates]);

  if (editTemplate !== null) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{editTemplate === 'new' ? 'New Checklist' : `Edit — ${editTemplate.name}`}</h3>
          <Button variant="ghost" size="sm" onClick={() => setEditTemplate(null)}>← Back</Button>
        </div>
        <ChecklistTemplateEditor
          template={editTemplate === 'new' ? null : editTemplate}
          onSave={handleSave}
          onClose={() => setEditTemplate(null)}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Manage Checklists</h3>
          <p className="text-sm text-muted-foreground">Create and edit checklists for your team. Staff can run them from the Checklists page.</p>
        </div>
        <Button onClick={() => setEditTemplate('new')} className="gap-2">
          <Plus className="w-4 h-4" /> New Checklist
        </Button>
      </div>
      {templates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No checklists yet — create your first one.</Card>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{CATEGORY_LABELS[cat] || cat}</h4>
            {items.map(tmpl => (
              <Card key={tmpl.id} className="p-4 flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{tmpl.name}</p>
                  <p className="text-xs text-muted-foreground">{tmpl.items.length} items · {CATEGORY_LABELS[cat] || cat}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditTemplate(tmpl)}>Edit</Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(tmpl.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function ChecklistTemplateEditor({ template, onSave, onClose }) {
  const [name, setName] = useState(template?.name || '');
  const [category, setCategory] = useState(template?.category || 'daily');
  const [items, setItems] = useState(template?.items || []);
  const [newItem, setNewItem] = useState('');
  const [newNote, setNewNote] = useState('');

  const addItem = () => {
    if (!newItem.trim()) return;
    setItems(prev => [...prev, { id: Date.now().toString(), text: newItem.trim(), note: newNote.trim() || undefined }]);
    setNewItem(''); setNewNote('');
  };
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const moveItem = (id, dir) => {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const next = [...items]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setItems(next);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold">Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Opening Checklist" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold">Category</Label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
            <option value="daily">📅 Daily</option>
            <option value="weekly">📆 Weekly</option>
            <option value="monthly">🗓 Monthly</option>
            <option value="odd-jobs">🔧 Odd Jobs</option>
            <option value="other">📋 Other</option>
          </select>
        </div>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto border border-border rounded-lg p-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No items yet</p>}
        {items.map((item, idx) => (
          <div key={item.id} className="flex items-start gap-2 p-2 rounded bg-muted/20">
            <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.text}</p>
              {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
            </div>
            <button onClick={() => moveItem(item.id, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs px-1">↑</button>
            <button onClick={() => moveItem(item.id, 1)} disabled={idx === items.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs px-1">↓</button>
            <button onClick={() => removeItem(item.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      <div className="border border-dashed border-border rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Add item</p>
        <Input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Task description" onKeyDown={e => e.key === 'Enter' && addItem()} />
        <Input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Optional instruction or note" className="text-sm" />
        <Button size="sm" onClick={addItem} disabled={!newItem.trim()} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add</Button>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => onSave({ ...(template || {}), id: template?.id || Date.now().toString(), name, category, items })} disabled={!name.trim() || items.length === 0}>
          {template ? 'Save Changes' : 'Create Checklist'}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}