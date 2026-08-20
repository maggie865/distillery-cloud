import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { uploadFile } from '@/lib/uploadFile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Upload, Loader2, FileText, Pencil, ExternalLink, Trash2, MapPin, Eye, Search, Link2, Camera } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import MaterialAutocomplete from '@/components/receiving/MaterialAutocomplete';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import Pagination from '@/components/ui/Pagination';

const MATERIAL_TYPES = ['Ethanol', 'Botanicals', 'Packaging', 'Grain', 'Sugar', 'Water', 'Flavoring', 'Other'];
const TRANSPORT_METHODS = ['road', 'courier', 'air', 'sea', 'pickup'];
const UNITS = ['litres', 'kg', 'units'];
const DISTILLERY_ADDRESS = '250 Ocean Beach Road, Bluff, New Zealand';

// Maps the human-facing Type select values to the lowercase `type` stored on
// raw_material (and back), so a matched/aliased stock item can pre-fill a
// line's Type field correctly. 'Botanicals' -> 'botanical' etc.
const TYPE_MAP = { 'Ethanol': 'ethanol', 'Botanicals': 'botanical', 'Packaging': 'packaging', 'Grain': 'grain', 'Sugar': 'sugar', 'Water': 'water', 'Flavoring': 'flavoring', 'Other': 'other' };
const INVERSE_TYPE_MAP = Object.fromEntries(Object.entries(TYPE_MAP).map(([k, v]) => [v, k]));

const BLANK_EDIT_FORM = {
  material_name: '', material_type: '', quantity: '', unit: 'litres',
  abv_percent: '', supplier_id: '', supplier_name: '', transport_distance_km: '', transport_method: 'road',
  weight_kg: '', cost_per_unit: '', batch_number: '', packing_slip_number: '',
  date_received: new Date().toISOString().split('T')[0], notes: '', packing_slip_url: ''
};

const BLANK_HEADER = {
  supplier_id: '', supplier_name: '', transport_distance_km: '', transport_method: 'road',
  packing_slip_number: '', date_received: new Date().toISOString().split('T')[0],
  notes: '', packing_slip_url: '',
};

const blankLine = () => ({
  _key: `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  material_name: '', material_type: '', quantity: '', unit: 'litres',
  abv_percent: '', weight_kg: '', cost_per_unit: '', batch_number: '',
  matchedRawMaterialId: null,
});

// ── Shared "receive a material into stock" logic ─────────────────────────────
// Used per-line so a multi-item packing slip can merge several lines into the
// same RawMaterial record sequentially without racing each other.

function findExistingRawMaterial(allRM, payload) {
  const isEthanol = (payload.material_type || '').toLowerCase() === 'ethanol';
  const incomingName = (payload.material_name || '').toLowerCase().trim();
  if (isEthanol) {
    // For ethanol: match by name similarity so Lactonol deliveries go into Lactonol record
    // and wheat/ENA deliveries go into their own record — don't blindly merge all ethanol types
    return allRM.find(r => (r.type || '').toLowerCase() === 'ethanol' &&
        (r.name || '').toLowerCase().trim() === incomingName) ||
      allRM.find(r => (r.type || '').toLowerCase() === 'ethanol' && (() => {
        const rn = (r.name || '').toLowerCase();
        const lactonolIn = incomingName.includes('lactonol') || incomingName.includes('lactanol');
        const lactonolRec = rn.includes('lactonol') || rn.includes('lactanol');
        if (lactonolIn && lactonolRec) return true;
        const wheatIn = incomingName.includes('wheat') || incomingName.includes('ena') || incomingName.includes('neutral');
        const wheatRec = rn.includes('wheat') || rn.includes('ena') || rn.includes('neutral');
        if (wheatIn && wheatRec) return true;
        return false;
      })());
  }
  return allRM.find(r => (r.name || '').toLowerCase().trim() === incomingName);
}

function calcLineCo2e(line, header) {
  const weight = line.weight_kg ? parseFloat(line.weight_kg) : 0;
  const distance = header.transport_distance_km ? parseFloat(header.transport_distance_km) : 0;
  if (header.transport_method === 'pickup' || weight <= 0 || distance <= 0) return 0;
  return weight / 1000 / 56 * distance * 0.21;
}

function buildLinePayload(header, line) {
  const lals = line.material_type === 'Ethanol' && line.abv_percent
    ? (parseFloat(line.quantity) * parseFloat(line.abv_percent) / 100)
    : undefined;
  const weight = line.weight_kg ? parseFloat(line.weight_kg) : 0;
  const distance = header.transport_distance_km ? parseFloat(header.transport_distance_km) : 0;
  const method = header.transport_method || 'road';
  const co2e = calcLineCo2e(line, header);

  return {
    material_name: line.material_name,
    material_type: line.material_type || undefined,
    quantity: parseFloat(line.quantity),
    unit: line.unit,
    abv_percent: line.abv_percent ? parseFloat(line.abv_percent) : undefined,
    lals,
    supplier_id: header.supplier_id || undefined,
    supplier_name: header.supplier_name || undefined,
    transport_distance_km: distance || undefined,
    transport_method: method || undefined,
    weight_kg: weight || undefined,
    co2e_kg: co2e > 0 ? parseFloat(co2e.toFixed(3)) : undefined,
    cost_per_unit: line.cost_per_unit ? parseFloat(line.cost_per_unit) : undefined,
    batch_number: line.batch_number || undefined,
    packing_slip_number: header.packing_slip_number || undefined,
    date_received: header.date_received,
    notes: header.notes || undefined,
    packing_slip_url: header.packing_slip_url || undefined,
  };
}

async function receiveLine({ header, line, allRM }) {
  const payload = buildLinePayload(header, line);
  const created = await base44.entities.Receiving.create(payload);

  const isEthanol = (payload.material_type || '').toLowerCase() === 'ethanol';
  const existingRM = line.matchedRawMaterialId
    ? allRM.find(r => r.id === line.matchedRawMaterialId)
    : findExistingRawMaterial(allRM, payload);

  const newLot = {
    lot_number: payload.batch_number
      ? `${payload.batch_number}${isEthanol && payload.material_name ? ' — ' + payload.material_name : ''}`
      : (isEthanol && payload.material_name ? payload.material_name : null),
    date_received: payload.date_received,
    quantity_received: payload.quantity || 0,
    quantity_remaining: payload.quantity || 0,
    supplier: payload.supplier_name || null,
    cost_per_unit: payload.cost_per_unit || null,
    receiving_id: created.id,
  };

  if (existingRM) {
    const existingLots = Array.isArray(existingRM.lots) ? existingRM.lots : [];

    // If this item already had stock that isn't accounted for in any lot
    // (predates lot tracking, or was adjusted directly), that quantity is
    // invisible to FIFO — depletion would draw from this brand-new lot
    // first instead of the older stock already on the shelf, and cost
    // everything at today's price immediately. Backfill one synthetic lot
    // for the gap, dated before this receiving, at the item's previous
    // cost, so FIFO still uses the old stock — and old pricing — first.
    const trackedQty = existingLots.reduce((sum, l) => sum + (l.quantity_remaining || 0), 0);
    const untrackedQty = parseFloat(((existingRM.quantity || 0) - trackedQty).toFixed(4));
    const backfillLot = untrackedQty > 0.0001 ? [{
      lot_number: null,
      date_received: existingRM.date_received || payload.date_received,
      quantity_received: untrackedQty,
      quantity_remaining: untrackedQty,
      supplier: 'Opening stock (pre-lot tracking)',
      cost_per_unit: existingRM.cost_per_unit || null,
      receiving_id: null,
    }] : [];

    return base44.entities.RawMaterial.update(existingRM.id, {
      quantity: parseFloat(((existingRM.quantity || 0) + (payload.quantity || 0)).toFixed(4)),
      lals: parseFloat(((existingRM.lals || 0) + (payload.lals || 0)).toFixed(4)),
      cost_per_unit: payload.cost_per_unit || existingRM.cost_per_unit,
      date_received: payload.date_received,
      lots: [...existingLots, ...backfillLot, newLot],
    });
  }
  return base44.entities.RawMaterial.create({
    name: payload.material_name,
    type: TYPE_MAP[payload.material_type] || 'other',
    quantity: payload.quantity || 0,
    unit: payload.unit,
    lals: payload.lals || 0,
    abv_percent: payload.abv_percent,
    batch_number: payload.batch_number || null,
    supplier: payload.supplier_name,
    cost_per_unit: payload.cost_per_unit,
    date_received: payload.date_received,
    receiving_id: created.id,
    lots: [newLot],
  });
}

// ── Packing Slip Viewer Dialog ───────────────────────────────────────────────
function PackingSlipViewer({ url, onClose }) {
  const isPdf = url?.toLowerCase().includes('.pdf');
  return (
    <Dialog open={!!url} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileText className="w-4 h-4" /> Packing Slip
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded-lg border border-border mt-2">
          {isPdf ? (
            <iframe src={url} className="w-full h-[70vh]" title="Packing Slip" />
          ) : (
            <img src={url} alt="Packing Slip" className="w-full h-auto max-h-[70vh] object-contain" />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
            </Button>
          </a>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── A single line item within the multi-item Receive dialog ─────────────────
function LineItemRow({ line, index, onChange, onRemove, canRemove, rawMaterials, aliases, onCreateAlias }) {
  const set = (field, value) => onChange({ ...line, [field]: value });

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Item {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Material Name</Label>
          <MaterialAutocomplete
            value={line.material_name}
            onChange={(name, rm) => {
              if (!rm) { onChange({ ...line, material_name: name, matchedRawMaterialId: null }); return; }
              onChange({
                ...line,
                material_name: rm.name,
                material_type: INVERSE_TYPE_MAP[(rm.type || '').toLowerCase()] || line.material_type,
                unit: rm.unit || line.unit,
                matchedRawMaterialId: rm.id,
              });
            }}
            rawMaterials={rawMaterials}
            aliases={aliases}
            onCreateAlias={onCreateAlias}
          />
          {line.matchedRawMaterialId && (
            <p className="text-xs text-primary flex items-center gap-1 mt-1"><Link2 className="w-3 h-3" /> Matched to existing stock item</p>
          )}
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={line.material_type} onValueChange={v => set('material_type', v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {MATERIAL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Quantity</Label>
          <Input type="number" step="0.01" value={line.quantity} onChange={e => set('quantity', e.target.value)} required />
        </div>
        <div>
          <Label className="text-xs">Unit</Label>
          <Select value={line.unit} onValueChange={v => set('unit', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {line.material_type === 'Ethanol' && (
          <div>
            <Label className="text-xs">ABV %</Label>
            <Input type="number" step="0.1" value={line.abv_percent} onChange={e => set('abv_percent', e.target.value)} />
          </div>
        )}
        <div>
          <Label className="text-xs">Cost per unit</Label>
          <Input type="number" step="0.01" value={line.cost_per_unit} onChange={e => set('cost_per_unit', e.target.value)} placeholder="e.g. 2.50" />
        </div>
        <div>
          <Label className="text-xs">Batch / Lot #</Label>
          <Input value={line.batch_number} onChange={e => set('batch_number', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Weight (kg)</Label>
          <Input type="number" step="0.1" value={line.weight_kg} onChange={e => set('weight_kg', e.target.value)} placeholder="For CO2e" />
        </div>
      </div>
    </div>
  );
}

export default function Receiving() {
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(BLANK_EDIT_FORM);

  const [createOpen, setCreateOpen] = useState(false);
  const [header, setHeader] = useState(BLANK_HEADER);
  const [lines, setLines] = useState([blankLine()]);

  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [calcingDistance, setCalcingDistance] = useState(false);
  const [viewingSlip, setViewingSlip] = useState(null);
  const queryClient = useQueryClient();

  const { refetch } = useQuery({
    queryKey: ['receivings'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 5000),
  });

  const isRefreshing = usePullToRefresh(() => refetch());

  const receivingsQuery = useQuery({
    queryKey: ['receivings'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 5000),
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('business_name', 5000),
  });

  const rawMaterialsQuery = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 5000),
  });

  const aliasesQuery = useQuery({
    queryKey: ['productAliases'],
    queryFn: () => base44.entities.ProductAlias.list('alias_name', 5000),
  });

  const rawMaterials = rawMaterialsQuery.data || [];
  const aliases = aliasesQuery.data || [];

  const createAliasMutation = useMutation({
    mutationFn: ({ aliasName, rawMaterialId }) => base44.entities.ProductAlias.create({ alias_name: aliasName.trim(), raw_material_id: rawMaterialId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productAliases'] });
      toast.success('Linked — this name will auto-match next time');
    },
    onError: (err) => toast.error('Failed to link: ' + (err?.message || 'Unknown error')),
  });

  const setEdit = (field, value) => setEditForm(prev => ({ ...prev, [field]: value }));

  const openNewReceive = () => {
    setHeader(BLANK_HEADER);
    setLines([blankLine()]);
    setCreateOpen(true);
  };

  const openEdit = (r) => {
    setEditingId(r.id);
    setEditForm({
      material_name: r.material_name || '',
      material_type: r.material_type || '',
      quantity: r.quantity != null ? String(r.quantity) : '',
      unit: r.unit || 'litres',
      abv_percent: r.abv_percent != null ? String(r.abv_percent) : '',
      supplier_id: r.supplier_id || '',
      supplier_name: r.supplier_name || '',
      transport_distance_km: r.transport_distance_km != null ? String(r.transport_distance_km) : '',
      transport_method: r.transport_method || 'road',
      weight_kg: r.weight_kg != null ? String(r.weight_kg) : '',
      cost_per_unit: r.cost_per_unit != null ? String(r.cost_per_unit) : '',
      batch_number: r.batch_number || '',
      packing_slip_number: r.packing_slip_number || '',
      date_received: r.date_received || new Date().toISOString().split('T')[0],
      notes: r.notes || '',
      packing_slip_url: r.packing_slip_url || '',
    });
    setEditOpen(true);
  };

  const calculateDistance = async (supplierAddress, applyTo) => {
    if (!supplierAddress) return;
    setCalcingDistance(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-distance-matrix', {
        body: { origin: supplierAddress, destination: DISTILLERY_ADDRESS },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to calculate distance');
      applyTo(f => ({ ...f, transport_distance_km: String(data.distance_km) }));
      toast.success(`Distance: ${data.distance_km} km`);
    } catch (err) {
      toast.error(err.message || 'Could not calculate distance — enter manually');
    } finally {
      setCalcingDistance(false);
    }
  };

  // ── Upload packing slip to Supabase Storage ─────────────────────────────────
  const uploadPackingSlip = async (file) => {
    return uploadFile(file, 'packing-slips');
  };

  // ── Handle packing slip file selection ────────────────────────────────────
  const handlePackingSlip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!createOpen) {
      setHeader(BLANK_HEADER);
      setLines([blankLine()]);
      setCreateOpen(true);
    }

    setUploadingSlip(true);
    try {
      // 1. Upload to Supabase Storage first
      const publicUrl = await uploadPackingSlip(file);
      setHeader(prev => ({ ...prev, packing_slip_url: publicUrl }));
      toast.success('Packing slip uploaded');

      // 2. Try to extract data via the extract-packing-slip Edge Function —
      // one packing slip can list several distinct items, so the schema asks
      // for an array of lines.
      setExtracting(true);
      try {
        // Give the model your actual product/alias names so it can map
        // supplier wording ("Neutral Grain Spirit 96") straight onto what
        // you already track ("Wheat ENA 96%") instead of inventing a new one.
        const knownItemNames = [...new Set([
          ...rawMaterials.map(rm => rm.name),
          ...aliases.map(a => a.alias_name),
        ].filter(Boolean))];

        const { data: result, error } = await supabase.functions.invoke('extract-packing-slip', {
          body: { file_url: publicUrl, known_items: knownItemNames },
        });
        if (error) throw error;
        if (!result?.success) throw new Error(result?.error || 'Extraction failed');

        const d = result.data;
        const VALID_UNITS = ['litres', 'kg', 'units'];

        let matchedSupplier = null;
        if (d.supplier && suppliersQuery.data) {
          matchedSupplier = suppliersQuery.data.find(s =>
            s.business_name.toLowerCase().includes(d.supplier.toLowerCase()) ||
            d.supplier.toLowerCase().includes(s.business_name.toLowerCase())
          );
        }

        setHeader(prev => ({
          ...prev,
          supplier_id: matchedSupplier?.id || prev.supplier_id,
          supplier_name: matchedSupplier?.business_name || d.supplier || prev.supplier_name,
          packing_slip_number: d.packing_slip_number || prev.packing_slip_number,
          date_received: d.date_received || prev.date_received,
          notes: d.notes || prev.notes,
        }));

        if (matchedSupplier?.address) {
          setTimeout(() => calculateDistance(matchedSupplier.address, setHeader), 500);
        }

        const aliasByLowerName = new Map(aliases.map(a => [(a.alias_name || '').toLowerCase().trim(), a]));
        const rawMaterialById = new Map(rawMaterials.map(rm => [rm.id, rm]));

        // Exact match first (the model was asked to echo a known name back
        // verbatim when there's a clear match). Fall back to a substring
        // match either direction, same leniency MaterialAutocomplete's own
        // suggestion dropdown uses, in case the model paraphrased slightly.
        const findMatch = (typedName) => {
          if (!typedName) return null;
          const alias = aliasByLowerName.get(typedName);
          if (alias) return rawMaterialById.get(alias.raw_material_id) || null;
          const exactRM = rawMaterials.find(rm => rm.name.toLowerCase().trim() === typedName);
          if (exactRM) return exactRM;
          for (const a of aliases) {
            const an = (a.alias_name || '').toLowerCase().trim();
            if (an && (an.includes(typedName) || typedName.includes(an))) {
              const rm = rawMaterialById.get(a.raw_material_id);
              if (rm) return rm;
            }
          }
          return rawMaterials.find(rm => {
            const rn = rm.name.toLowerCase().trim();
            return rn && (rn.includes(typedName) || typedName.includes(rn));
          }) || null;
        };

        const items = Array.isArray(d.items) ? d.items.filter(it => it.material_name) : [];
        if (items.length > 0) {
          setLines(items.map((it) => {
            const typedName = (it.material_name || '').toLowerCase().trim();
            const matchedRM = findMatch(typedName);
            return {
              _key: `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              material_name: matchedRM?.name || it.material_name || '',
              material_type: matchedRM
                ? (INVERSE_TYPE_MAP[(matchedRM.type || '').toLowerCase()] || '')
                : (MATERIAL_TYPES.find(t => t.toLowerCase().includes((it.material_type || '').toLowerCase())) || ''),
              unit: matchedRM?.unit || (VALID_UNITS.includes(it.unit) ? it.unit : 'litres'),
              quantity: it.quantity != null ? String(it.quantity) : '',
              abv_percent: it.abv_percent != null ? String(it.abv_percent) : '',
              weight_kg: '',
              cost_per_unit: it.cost_per_unit != null ? String(it.cost_per_unit) : '',
              batch_number: it.batch_number || '',
              matchedRawMaterialId: matchedRM?.id || null,
            };
          }));
        }

        toast.success(`Packing slip scanned — ${items.length || 1} item${items.length !== 1 ? 's' : ''} found, please review before saving`);
      } catch (err) {
        // Extraction failed — slip is still uploaded and attached either way
        toast.info('Slip uploaded — could not auto-extract fields (' + (err.message || 'unknown error') + '), please fill in manually');
      } finally {
        setExtracting(false);
      }
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploadingSlip(false);
      e.target.value = '';
    }
  };

  const calcReceivingCo2e = (data = editForm) => {
    const weight = data.weight_kg ? parseFloat(data.weight_kg) : 0;
    const distance = data.transport_distance_km ? parseFloat(data.transport_distance_km) : 0;
    if (data.transport_method === 'pickup' || weight <= 0 || distance <= 0) return 0;
    return weight / 1000 / 56 * distance * 0.21;
  };

  const buildEditPayload = (data) => {
    const lals = data.material_type === 'Ethanol' && data.abv_percent
      ? (parseFloat(data.quantity) * parseFloat(data.abv_percent) / 100)
      : undefined;

    const weight = data.weight_kg ? parseFloat(data.weight_kg) : 0;
    const distance = data.transport_distance_km ? parseFloat(data.transport_distance_km) : 0;
    const method = data.transport_method || 'road';
    const co2e = calcReceivingCo2e(data);

    return {
      material_name: data.material_name,
      material_type: data.material_type || undefined,
      quantity: parseFloat(data.quantity),
      unit: data.unit,
      abv_percent: data.abv_percent ? parseFloat(data.abv_percent) : undefined,
      lals,
      supplier_id: data.supplier_id || undefined,
      supplier_name: data.supplier_name || undefined,
      transport_distance_km: distance || undefined,
      transport_method: method || undefined,
      weight_kg: weight || undefined,
      co2e_kg: co2e > 0 ? parseFloat(co2e.toFixed(3)) : undefined,
      cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : undefined,
      batch_number: data.batch_number || undefined,
      packing_slip_number: data.packing_slip_number || undefined,
      date_received: data.date_received,
      notes: data.notes || undefined,
      packing_slip_url: data.packing_slip_url || undefined,
    };
  };

  const createMutation = useMutation({
    mutationFn: async ({ header, lines }) => {
      let allRM = await base44.entities.RawMaterial.list('name', 5000);
      for (const line of lines) {
        const updated = await receiveLine({ header, line, allRM });
        const idx = allRM.findIndex(r => r.id === updated.id);
        if (idx >= 0) allRM[idx] = updated; else allRM = [...allRM, updated];
      }
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setCreateOpen(false);
      setHeader(BLANK_HEADER);
      setLines([blankLine()]);
      const n = variables.lines.length;
      toast.success(`${n} item${n !== 1 ? 's' : ''} received and inventory updated`);
    },
    onError: (err) => {
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const payload = buildEditPayload(data);
      await base44.entities.Receiving.update(editingId, payload);

      // If quantity or cost changed, sync linked RawMaterial
      const original = receivingsQuery.data?.find(r => r.id === editingId);
      const newCost = data.cost_per_unit ? parseFloat(data.cost_per_unit) : null;
      const costChanged = original && newCost !== (original.cost_per_unit ?? null);
      const qtyChanged = original && parseFloat(data.quantity) !== original.quantity;
      if (qtyChanged || costChanged) {
        const linked = await base44.entities.RawMaterial.filter({ receiving_id: editingId });
        for (const rm of linked) {
          const update = {};
          if (qtyChanged) update.quantity = parseFloat(data.quantity);
          if (costChanged) update.cost_per_unit = newCost ?? undefined;
          await base44.entities.RawMaterial.update(rm.id, update);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setEditOpen(false);
      setEditingId(null);
      setEditForm(BLANK_EDIT_FORM);
      toast.success('Receiving record updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update receiving record'),
  });

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    for (const line of lines) {
      if (!line.material_type) {
        toast.error('Please select a material type for every item');
        return;
      }
      if (!line.material_name || !line.quantity) {
        toast.error('Every item needs a name and quantity');
        return;
      }
    }
    createMutation.mutate({ header, lines });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editForm.material_type) {
      toast.error('Please select a material type');
      return;
    }
    updateMutation.mutate(editForm);
  };

  const deleteMutation = useMutation({
    mutationFn: async (record) => {
      // Delete linked RawMaterial records
      const linked = await base44.entities.RawMaterial.filter({ receiving_id: record.id });
      for (const rm of linked) {
        await base44.entities.RawMaterial.delete(rm.id);
      }
      await base44.entities.Receiving.delete(record.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      toast.success('Record deleted and inventory updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to delete receiving record'),
  });

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const rawData = receivingsQuery.data || [];
  const isLoading = receivingsQuery.isLoading;
  const data = rawData.filter(r => {
    const matchType = filterType === 'all' || r.material_type === filterType;
    const s = search.toLowerCase();
    const matchSearch = !s || r.material_name?.toLowerCase().includes(s) || r.supplier_name?.toLowerCase().includes(s) || r.batch_number?.toLowerCase().includes(s);
    return matchType && matchSearch;
  });
  const pagedData = data.slice((page - 1) * pageSize, page * pageSize);

  const totalCo2e = lines.reduce((sum, l) => sum + calcLineCo2e(l, header), 0);

  return (
    <div className="relative">
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-primary/20 z-50">
          <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
        </div>
      )}

      <PageHeader title="Receiving" subtitle="Log incoming raw materials and ethanol">
        {/* Camera-direct shortcut, mobile only - a separate input from the
            general upload button below since forcing `capture` on that one
            would also block picking an existing PDF/photo (e.g. a slip
            emailed as a PDF), which is at least as common as photographing
            a paper one on the spot. */}
        <label className="cursor-pointer md:hidden">
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePackingSlip} disabled={uploadingSlip || extracting} />
          <div className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors ${(uploadingSlip || extracting) ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Camera className="w-4 h-4" />
            Take Photo
          </div>
        </label>
        <label className="cursor-pointer">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handlePackingSlip} disabled={uploadingSlip || extracting} />
          <div className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors ${(uploadingSlip || extracting) ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {(uploadingSlip || extracting) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploadingSlip ? 'Uploading…' : extracting ? 'Scanning…' : 'Scan Packing Slip'}
          </div>
        </label>
        <Button onClick={openNewReceive}><Plus className="w-4 h-4 mr-2" />Receive Material</Button>
      </PageHeader>

      {/* ── Multi-line Receive dialog ── */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) { setHeader(BLANK_HEADER); setLines([blankLine()]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Receive Material</DialogTitle>
          </DialogHeader>

          {(uploadingSlip || extracting) && (
            <div className="flex items-center gap-3 rounded-lg bg-primary/8 border border-primary/20 px-4 py-3 mb-2">
              <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">
                  {uploadingSlip ? 'Uploading packing slip…' : 'Scanning document…'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {uploadingSlip ? 'Your file is being saved securely' : 'Extracting items from your document'}
                </p>
              </div>
            </div>
          )}

          {!uploadingSlip && !extracting && header.packing_slip_url && (
            <div
              className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 mb-2 cursor-pointer hover:bg-green-100 transition-colors"
              onClick={() => setViewingSlip(header.packing_slip_url)}
            >
              <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700 font-medium">Packing slip attached — click to preview</p>
              <Eye className="w-4 h-4 text-green-600 ml-auto" />
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-5 mt-2">
            <div className="rounded-lg border border-border p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Packing Slip Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date Received</Label>
                  <Input type="date" value={header.date_received} onChange={e => setHeader(h => ({ ...h, date_received: e.target.value }))} required />
                </div>
                <div>
                  <Label>Packing Slip #</Label>
                  <Input value={header.packing_slip_number} onChange={e => setHeader(h => ({ ...h, packing_slip_number: e.target.value }))} placeholder="Packing slip reference" />
                </div>
                <div className="col-span-2">
                  <Label>Supplier</Label>
                  <Select value={header.supplier_id} onValueChange={v => {
                    const supplier = suppliersQuery.data?.find(s => s.id === v);
                    setHeader(h => ({ ...h, supplier_id: v, supplier_name: supplier?.business_name || '' }));
                    if (supplier?.address) calculateDistance(supplier.address, setHeader);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                    <SelectContent>
                      {suppliersQuery.data?.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.business_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {header.supplier_name && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {suppliersQuery.data?.find(s => s.id === header.supplier_id)?.address || ''}
                    </p>
                  </div>
                )}
                <div>
                  <Label>Transport Method</Label>
                  <Select value={header.transport_method} onValueChange={v => setHeader(h => ({ ...h, transport_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRANSPORT_METHODS.map(m => <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Distance (km)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      value={header.transport_distance_km}
                      onChange={e => setHeader(h => ({ ...h, transport_distance_km: e.target.value }))}
                      placeholder={calcingDistance ? 'Calculating…' : '0'}
                      disabled={calcingDistance}
                    />
                    {calcingDistance && (
                      <div className="absolute right-2.5 top-2.5">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} placeholder="Shared notes for this delivery" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items ({lines.length})</p>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLines(prev => [...prev, blankLine()])}>
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </Button>
              </div>
              {lines.map((line, i) => (
                <LineItemRow
                  key={line._key}
                  line={line}
                  index={i}
                  onChange={(next) => setLines(prev => prev.map(l => l._key === line._key ? next : l))}
                  onRemove={() => setLines(prev => prev.filter(l => l._key !== line._key))}
                  canRemove={lines.length > 1}
                  rawMaterials={rawMaterials}
                  aliases={aliases}
                  onCreateAlias={(aliasName, rawMaterialId) => createAliasMutation.mutateAsync({ aliasName, rawMaterialId })}
                />
              ))}
            </div>

            <div className="rounded-lg bg-muted/40 px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total CO2e</span>
              <span className="font-semibold text-green-600">{totalCo2e > 0 ? `${totalCo2e.toFixed(3)} kg` : '—'}</span>
            </div>

            <Button type="submit" className="w-full" disabled={createMutation.isPending || uploadingSlip || extracting}>
              {createMutation.isPending ? 'Saving...' : `Receive ${lines.length} Item${lines.length !== 1 ? 's' : ''}`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Single-record edit dialog ── */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingId(null); setEditForm(BLANK_EDIT_FORM); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Receiving Record</DialogTitle>
          </DialogHeader>

          {!uploadingSlip && editForm.packing_slip_url && (
            <div
              className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 mb-2 cursor-pointer hover:bg-green-100 transition-colors"
              onClick={() => setViewingSlip(editForm.packing_slip_url)}
            >
              <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700 font-medium">Packing slip attached — click to preview</p>
              <Eye className="w-4 h-4 text-green-600 ml-auto" />
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Material Name</Label>
                <MaterialAutocomplete
                  value={editForm.material_name}
                  onChange={(name, rm) => {
                    if (!rm) { setEdit('material_name', name); return; }
                    setEditForm(prev => ({
                      ...prev,
                      material_name: rm.name,
                      material_type: INVERSE_TYPE_MAP[(rm.type || '').toLowerCase()] || prev.material_type,
                      unit: rm.unit || prev.unit,
                    }));
                  }}
                  rawMaterials={rawMaterials}
                  aliases={aliases}
                  onCreateAlias={(aliasName, rawMaterialId) => createAliasMutation.mutateAsync({ aliasName, rawMaterialId })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={editForm.material_type} onValueChange={v => setEdit('material_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {MATERIAL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date Received</Label>
                <Input type="date" value={editForm.date_received} onChange={e => setEdit('date_received', e.target.value)} required />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input type="number" step="0.01" value={editForm.quantity} onChange={e => setEdit('quantity', e.target.value)} required />
              </div>
              <div>
                <Label>Cost per unit (excl. GST)</Label>
                <Input type="number" step="0.01" value={editForm.cost_per_unit} onChange={e => setEdit('cost_per_unit', e.target.value)} placeholder="e.g. 2.50" />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={editForm.unit} onValueChange={v => setEdit('unit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {editForm.material_type === 'Ethanol' && (
                <div>
                  <Label>ABV %</Label>
                  <Input type="number" step="0.1" value={editForm.abv_percent} onChange={e => setEdit('abv_percent', e.target.value)} />
                </div>
              )}
              {editForm.material_type === 'Ethanol' && editForm.quantity && editForm.abv_percent && (
                <div>
                  <Label>Calculated LALs</Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-medium">
                    {(parseFloat(editForm.quantity) * parseFloat(editForm.abv_percent) / 100).toFixed(3)}
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <Label>Supplier</Label>
                <Select value={editForm.supplier_id} onValueChange={v => {
                  const supplier = suppliersQuery.data?.find(s => s.id === v);
                  setEdit('supplier_id', v);
                  setEdit('supplier_name', supplier?.business_name || '');
                  if (supplier?.address) calculateDistance(supplier.address, setEditForm);
                }}>
                  <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliersQuery.data?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.business_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editForm.supplier_name && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {suppliersQuery.data?.find(s => s.id === editForm.supplier_id)?.address || ''}
                  </p>
                </div>
              )}
              <div>
                <Label>Weight (kg)</Label>
                <Input type="number" step="0.1" value={editForm.weight_kg} onChange={e => setEdit('weight_kg', e.target.value)} placeholder="For CO2e calculation" />
              </div>
              <div>
                <Label>Distance (km)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    value={editForm.transport_distance_km}
                    onChange={e => setEdit('transport_distance_km', e.target.value)}
                    placeholder={calcingDistance ? 'Calculating…' : '0'}
                    disabled={calcingDistance}
                  />
                  {calcingDistance && (
                    <div className="absolute right-2.5 top-2.5">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label>Transport Method</Label>
                <Select value={editForm.transport_method} onValueChange={v => setEdit('transport_method', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSPORT_METHODS.map(m => <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CO2e (kg)</Label>
                <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-semibold text-green-600">
                  {calcReceivingCo2e() > 0 ? `${calcReceivingCo2e().toFixed(3)} kg` : '—'}
                </div>
              </div>
              <div>
                <Label>Batch Number</Label>
                <Input value={editForm.batch_number} onChange={e => setEdit('batch_number', e.target.value)} />
              </div>
              <div>
                <Label>Packing Slip #</Label>
                <Input value={editForm.packing_slip_number} onChange={e => setEdit('packing_slip_number', e.target.value)} placeholder="Packing slip reference" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={editForm.notes} onChange={e => setEdit('notes', e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-2 p-4 border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search material, supplier, batch…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-8 text-sm" />
          </div>
          <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {MATERIAL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>CO2e</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Slip</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No receivings yet</TableCell></TableRow>
              ) : pagedData.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.date_received ? format(new Date(r.date_received), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="font-medium text-sm">{r.material_name}</TableCell>
                    <TableCell className="text-sm">{r.material_type}</TableCell>
                  <TableCell className="text-sm">{r.quantity} {r.unit}</TableCell>
                  <TableCell className="text-sm">{r.supplier_name || '—'}</TableCell>
                  <TableCell className="text-sm">{r.transport_distance_km ? `${r.transport_distance_km} km` : '—'}</TableCell>
                  <TableCell className="text-sm font-semibold text-green-600">{r.co2e_kg ? `${r.co2e_kg.toFixed(3)} kg` : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.lals ? r.lals.toFixed(3) : '—'}</TableCell>
                  <TableCell>
                    {r.packing_slip_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setViewingSlip(r.packing_slip_url)}
                      >
                        <Eye className="w-3 h-3" /> View
                      </Button>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm('Delete this receiving record?')) deleteMutation.mutate(r); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileCardGrid>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
          ) : data.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No receivings yet</p>
          ) : pagedData.map(r => (
            <MobileCard
              key={r.id}
              title={r.material_name}
              subtitle={`${r.date_received ? format(new Date(r.date_received), 'MMM d, yyyy') : '—'} • ${r.material_type}`}
              badge={r.packing_slip_url ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><FileText className="w-3 h-3" /> Slip</span> : null}
              accent={<span className="text-sm font-semibold">{r.quantity} {r.unit}</span>}
              actions={
                <>
                  {r.packing_slip_url && <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setViewingSlip(r.packing_slip_url)}><Eye className="w-3.5 h-3.5" /> Slip</Button>}
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => { if (confirm('Delete this receiving record?')) deleteMutation.mutate(r); }}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                </>
              }
            >
              <MobileDetailRow label="Supplier" value={r.supplier_name || '—'} />
              <MobileDetailRow label="Batch" value={r.batch_number || '—'} />
              <MobileDetailRow label="Distance" value={r.transport_distance_km ? `${r.transport_distance_km} km` : '—'} />
              <MobileDetailRow label="CO2e" value={r.co2e_kg ? `${r.co2e_kg.toFixed(3)} kg` : '—'} highlight />
              {r.lals != null && <MobileDetailRow label="LALs" value={r.lals.toFixed(3)} highlight />}
            </MobileCard>
          ))}
        </MobileCardGrid>
        <Pagination total={data.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </Card>

      {/* Packing Slip Viewer */}
      <PackingSlipViewer url={viewingSlip} onClose={() => setViewingSlip(null)} />
    </div>
  );
}
