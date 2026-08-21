import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '@/components/ui/Pagination';
import { ChevronDown, CalendarCheck, Flame, Plus } from 'lucide-react';
import { toast } from 'sonner';

const RESULT_CLS = { pass: 'text-emerald-600', fail: 'text-red-600', needs_attention: 'text-amber-600' };
const RESULT_LABEL = { pass: '✅ Pass', fail: '❌ Fail', needs_attention: '⚠ Needs Attention' };

const FIRST_AID_ITEMS = [
  { key: 'bandages', label: 'Adhesive bandages (assorted sizes)', qty: '20+' },
  { key: 'gauze', label: 'Sterile gauze pads', qty: '' },
  { key: 'tape', label: 'Adhesive tape roll', qty: '' },
  { key: 'antiseptic_wipes', label: 'Antiseptic wipes', qty: '' },
  { key: 'antiseptic_cream', label: 'Antiseptic cream / spray', qty: '' },
  { key: 'triangular_bandage', label: 'Triangular bandage / sling', qty: '' },
  { key: 'scissors', label: 'Scissors', qty: '' },
  { key: 'tweezers', label: 'Tweezers', qty: '' },
  { key: 'gloves', label: 'Disposable gloves (min 2 pairs)', qty: '' },
  { key: 'eye_wash', label: 'Eye wash solution', qty: '' },
  { key: 'eye_pad', label: 'Eye pad / dressing', qty: '' },
  { key: 'cold_pack', label: 'Cold pack / instant ice pack', qty: '' },
  { key: 'burn_gel', label: 'Burn gel / dressing', qty: '' },
  { key: 'cpr_mask', label: 'CPR face shield / mask', qty: '' },
  { key: 'manual', label: 'First aid manual / instructions', qty: '' },
  { key: 'incident_forms', label: 'Incident report forms', qty: '' },
];

function YesNo({ value, onChange, yesLabel = '✅ Good', noLabel = '❌ Issue Found' }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(true)}
        className={`flex-1 h-12 rounded-lg text-sm font-medium border-2 transition-colors ${value === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border hover:border-emerald-300'}`}>
        {yesLabel}
      </button>
      <button type="button" onClick={() => onChange(false)}
        className={`flex-1 h-12 rounded-lg text-sm font-medium border-2 transition-colors ${value === false ? 'border-red-500 bg-red-50 text-red-700' : 'border-border hover:border-red-300'}`}>
        {noLabel}
      </button>
    </div>
  );
}

// Compact 3-way toggle for the workplace inspection's Yes/No/N/A items -
// there are too many (39, across 9 sections) for the full-size YesNo
// buttons above to stay usable on a phone.
function YesNoNA({ value, onChange }) {
  const OPTS = [['yes', 'Yes', 'emerald'], ['no', 'No', 'red'], ['na', 'N/A', 'slate']];
  return (
    <div className="flex gap-1.5 shrink-0">
      {OPTS.map(([v, label, color]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`w-14 h-8 rounded-md text-xs font-medium border-2 transition-colors ${
            value === v
              ? color === 'emerald' ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : color === 'red' ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-slate-400 bg-slate-100 text-slate-700'
              : 'border-border hover:border-muted-foreground/50'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// From the "Permanent Workplace Inspection Checklist" template - grouped
// the same way as the source document's sections. Each item gets a
// Yes/No/N/A answer; free-text hazard/comment detail is captured once at
// the bottom (as "Additional hazards identified") rather than per item,
// since a per-item comment field for 39 items would make this unusable on
// a phone.
const WORKPLACE_INSPECTION_SECTIONS = [
  { section: 'Housekeeping', items: [
    'Work area clean / no trip hazards',
    'Floor coverings in good condition',
    'Adequate storage of materials/equipment',
    'Area free from pest/vermin problems',
    'Storage located clear of doors, corridors and frequently used passages',
    'Rubbish removed regularly',
    'Sharp corners, furniture/fittings do not create hazard',
    'Fans working and electrical leads in good condition/no faults',
  ]},
  { section: 'Work Area', items: [
    'Area/layout is suitable for task',
    'Lighting suitable for task',
    'Items stored safely on shelves/filing cabinets so as not to pose risk from falling',
  ]},
  { section: 'Amenities', items: [
    'Toilets/washing facilities clean and maintained',
    'Hand sanitiser and soap available',
    'Rubbish bins provided and emptied daily',
  ]},
  { section: 'Electrical', items: [
    'No damaged or frayed leads, no exposed wires',
    'Power boards in use – no double adapters',
    'Power leads in good condition and off the floor or placed away from walkways',
    'Faulty equipment/cords removed from workplace',
  ]},
  { section: 'Emergency Equipment', items: [
    'First aid kit available and stocked',
    'Smoke detector/alarm system installed and regularly tested',
    '1m clearance around fire extinguishers',
    'Fire equipment signs are directly above equipment',
    'Yellow indicator is in green section (sufficient pressure)',
    'Cable tie has not been tampered with',
    'Lock pin is intact',
    'Type of extinguisher appropriate for location',
  ]},
  { section: 'Workstations', items: [
    'No visual damage to desks or chairs',
    'No visual damage to computers, monitors, printers, scanners etc',
    'Ergonomics check completed in last 12 months',
    'Footrests available where required',
    'Anti-glare/blue light filters in place where required',
    'Sufficient lighting over workstations',
  ]},
  { section: 'Plant and Equipment', items: [
    'No visual damage to machinery/equipment',
    'Damaged or faulty equipment has been locked out',
  ]},
  { section: 'Site Security', items: [
    'Access to site is restricted to personnel',
    'Doors and locks are checked for damage/working order for escape in an emergency',
    'Outside areas clear and well lit',
    'No overgrown or obstructed areas',
  ]},
  { section: 'Administrative / System', items: [
    'Current HSW Policy statement displayed',
  ]},
];
const WORKPLACE_INSPECTION_ITEMS = WORKPLACE_INSPECTION_SECTIONS.flatMap(s => s.items);

function SectionHistory({ records, checkItemName, columns, renderRow }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = records.filter(r => r.check_item_name === checkItemName).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  if (filtered.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground">
        <span>View history ({filtered.length} records)</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="overflow-x-auto border rounded-lg mt-1">
          <Table>
            <TableHeader><TableRow>{columns.map(c => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{paged.map(r => renderRow(r))}</TableBody>
          </Table>
        </div>
        <div className="mt-2"><Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={() => {}} /></div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function StillCheck({ records, now, selectedMonth, onSave, saving }) {
  const today = format(now, 'yyyy-MM-dd');
  const [form, setForm] = useState({ seals: null, bolts: null, gauges: null, notes: '', performed_by: '', date: today });
  const [submitted, setSubmitted] = useState(false);
  const doneThisMonth = records.find(r => r.check_item_name === 'Still Condition Inspection' && r.date?.startsWith(selectedMonth));

  const handleSave = async () => {
    if (form.seals === null || form.bolts === null || form.gauges === null) { toast.error('Please answer all checks'); return; }
    if (!form.performed_by.trim()) { toast.error('Please enter your name'); return; }
    const allGood = form.seals && form.bolts && form.gauges;
    const notesParts = [`Seals: ${form.seals ? 'Good' : 'Issue Found'}`, `Bolts: ${form.bolts ? 'Good' : 'Issue Found'}`, `Gauges: ${form.gauges ? 'Good' : 'Issue Found'}`];
    if (form.notes) notesParts.push(`Notes: ${form.notes}`);
    try {
      await onSave([{ maintenance_type: 'monthly_check', check_item_name: 'Still Condition Inspection', equipment_name: 'Still', date: form.date, result: allGood ? 'pass' : 'needs_attention', notes: notesParts.join(' | '), performed_by: form.performed_by.trim(), requires_followup: !allGood, status: 'completed' }]);
      toast.success('Still inspection saved');
      setSubmitted(true);
    } catch (err) {
      toast.error(err.message || 'Failed to save still inspection');
    }
  };

  return (
    <Card className={`p-5 border-2 space-y-4 ${doneThisMonth ? 'border-emerald-300' : 'border-amber-300'}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">🔩 Still Condition Inspection</h3>
        {doneThisMonth ? <Badge className="bg-emerald-100 text-emerald-700">✅ Done {doneThisMonth.date ? format(parseISO(doneThisMonth.date), 'd MMM') : ''}</Badge> : <Badge className="bg-amber-100 text-amber-700">⚠ Due this month</Badge>}
      </div>
      {!submitted && (
        <div className="space-y-4">
          <div><Label className="text-xs font-semibold">Seal Conditions</Label><div className="mt-1"><YesNo value={form.seals} onChange={v => setForm(f => ({ ...f, seals: v }))} /></div></div>
          <div><Label className="text-xs font-semibold">Bolts</Label><div className="mt-1"><YesNo value={form.bolts} onChange={v => setForm(f => ({ ...f, bolts: v }))} /></div></div>
          <div><Label className="text-xs font-semibold">Gauges</Label><div className="mt-1"><YesNo value={form.gauges} onChange={v => setForm(f => ({ ...f, gauges: v }))} /></div></div>
          {(form.seals === false || form.bolts === false || form.gauges === false) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">⚠ Issues found — this record will be flagged for follow-up.</div>
          )}
          <div><Label className="text-xs font-semibold">Additional Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Completed by *</Label><Input value={form.performed_by} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))} placeholder="Your name" className="mt-1" /></div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">Save Still Inspection</Button>
        </div>
      )}
      {submitted && <p className="text-sm text-emerald-600 font-medium">✅ Saved successfully</p>}
      <SectionHistory records={records} checkItemName="Still Condition Inspection" columns={['Date', 'Seals / Bolts / Gauges', 'Result', 'By', 'Notes']}
        renderRow={r => (
          <TableRow key={r.id}>
            <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
            <TableCell className="text-sm">{r.notes?.split(' | ').slice(0,3).join(', ') || '—'}</TableCell>
            <TableCell className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</TableCell>
            <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.notes?.split(' | ').slice(3).join(' | ') || '—'}</TableCell>
          </TableRow>
        )}
      />
    </Card>
  );
}

function CondenserCheck({ records, now, selectedMonth, onSave, saving }) {
  const today = format(now, 'yyyy-MM-dd');
  const [form, setForm] = useState({ flow_meter: null, condenser: null, parrot: null, notes: '', performed_by: '', date: today });
  const [submitted, setSubmitted] = useState(false);
  const doneThisMonth = records.find(r => r.check_item_name === 'Condenser Check' && r.date?.startsWith(selectedMonth));

  const handleSave = async () => {
    if (form.flow_meter === null || form.condenser === null || form.parrot === null) { toast.error('Please answer all checks'); return; }
    if (!form.performed_by.trim()) { toast.error('Please enter your name'); return; }
    const requiresFollowup = form.flow_meter === false || form.condenser === 'poor';
    const result = requiresFollowup ? 'fail' : form.condenser === 'needs_attention' ? 'needs_attention' : 'pass';
    const notesParts = [`Flow Meter: ${form.flow_meter ? 'Operational' : 'NOT OPERATIONAL'}`, `Condenser: ${form.condenser === 'good' ? 'Good' : form.condenser === 'needs_attention' ? 'Needs Attention' : 'Poor'}`, `Parrot Head: ${form.parrot === 'cleaned' ? 'Cleaned Today' : 'Not Required'}`];
    if (form.notes) notesParts.push(`Notes: ${form.notes}`);
    try {
      await onSave([{ maintenance_type: 'monthly_check', check_item_name: 'Condenser Check', equipment_name: 'Condenser', date: form.date, result, notes: notesParts.join(' | '), performed_by: form.performed_by.trim(), requires_followup: requiresFollowup, status: 'completed' }]);
      toast.success('Condenser check saved');
      setSubmitted(true);
    } catch (err) {
      toast.error(err.message || 'Failed to save condenser check');
    }
  };

  return (
    <Card className={`p-5 border-2 space-y-4 ${doneThisMonth ? 'border-emerald-300' : 'border-amber-300'}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">🌡 Condenser Check</h3>
        {doneThisMonth ? <Badge className="bg-emerald-100 text-emerald-700">✅ Done {doneThisMonth.date ? format(parseISO(doneThisMonth.date), 'd MMM') : ''}</Badge> : <Badge className="bg-amber-100 text-amber-700">⚠ Due this month</Badge>}
      </div>
      {!submitted && (
        <div className="space-y-4">
          <div><Label className="text-xs font-semibold">Flow Meter Operational</Label><div className="mt-1"><YesNo value={form.flow_meter} onChange={v => setForm(f => ({ ...f, flow_meter: v }))} yesLabel="✅ Yes — Operational" noLabel="❌ No — Not Working" /></div></div>
          <div>
            <Label className="text-xs font-semibold">Condenser Condition</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[['good','✅ Good'],['needs_attention','⚠ Needs Attention'],['poor','❌ Poor']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, condenser: v }))}
                  className={`h-12 rounded-lg text-xs font-medium border-2 transition-colors ${form.condenser === v ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Parrot Head Cleaned</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[['cleaned','✅ Yes — Cleaned Today'],['not_required','⏭ Not Required']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, parrot: v }))}
                  className={`h-12 rounded-lg text-sm font-medium border-2 transition-colors ${form.parrot === v ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>{label}</button>
              ))}
            </div>
          </div>
          {(form.flow_meter === false || form.condenser === 'poor') && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">🔴 Issues found — this record will be flagged for follow-up.</div>
          )}
          <div><Label className="text-xs font-semibold">Additional Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Completed by *</Label><Input value={form.performed_by} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))} placeholder="Your name" className="mt-1" /></div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">Save Condenser Check</Button>
        </div>
      )}
      {submitted && <p className="text-sm text-emerald-600 font-medium">✅ Saved successfully</p>}
      <SectionHistory records={records} checkItemName="Condenser Check" columns={['Date', 'Flow Meter', 'Condenser', 'Parrot', 'Result', 'By']}
        renderRow={r => (
          <TableRow key={r.id}>
            <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
            <TableCell className="text-sm">{r.notes?.includes('NOT OPERATIONAL') ? '❌' : '✅'}</TableCell>
            <TableCell className="text-sm">{r.notes?.match(/Condenser: ([^|]+)/)?.[1]?.trim() || '—'}</TableCell>
            <TableCell className="text-sm">{r.notes?.match(/Parrot Head: ([^|]+)/)?.[1]?.trim() || '—'}</TableCell>
            <TableCell className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</TableCell>
            <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
          </TableRow>
        )}
      />
    </Card>
  );
}

function FirstAidCheck({ records, now, selectedMonth, onSave, saving }) {
  const today = format(now, 'yyyy-MM-dd');
  const initPresent = () => Object.fromEntries(FIRST_AID_ITEMS.map(i => [i.key, true]));
  const [present, setPresent] = useState(initPresent());
  const [performedBy, setPerformedBy] = useState('');
  const [date, setDate] = useState(today);
  const [submitted, setSubmitted] = useState(false);
  const doneThisMonth = records.find(r => r.check_item_name === 'First Aid Kit Check' && r.date?.startsWith(selectedMonth));
  const missingItems = FIRST_AID_ITEMS.filter(i => !present[i.key]);

  const handleSave = async () => {
    if (!performedBy.trim()) { toast.error('Please enter your name'); return; }
    const result = missingItems.length === 0 ? 'pass' : 'needs_attention';
    const notes = missingItems.length === 0 ? 'All items present' : `Missing: ${missingItems.map(i => i.label).join(', ')}`;
    try {
      await onSave([{ maintenance_type: 'monthly_check', check_item_name: 'First Aid Kit Check', equipment_name: 'First Aid Kit', date, result, notes, performed_by: performedBy.trim(), requires_followup: missingItems.length > 0, status: 'completed' }]);
    } catch (err) {
      toast.error(err.message || 'Failed to save first aid check');
      return;
    }
    if (missingItems.length > 0) {
      try {
        await base44.functions.invoke('sendMaintenanceAlert', { event: { type: 'create' }, data: { equipment_name: 'First Aid Kit', maintenance_type: 'monthly_check', check_item_name: 'First Aid Kit Check', date, performed_by: performedBy.trim(), result, notes, requires_followup: true, description: `Missing items: ${missingItems.map(i => i.label).join(', ')}` } });
        toast.success('First aid check saved & admin notified of missing items');
      } catch { toast.success('First aid check saved (email notification failed — check Gmail connection)'); }
    } else { toast.success('First aid kit check saved — all items present ✅'); }
    setSubmitted(true);
  };

  return (
    <Card className={`p-5 border-2 space-y-4 ${doneThisMonth ? 'border-emerald-300' : 'border-amber-300'}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">🩹 First Aid Kit Check</h3>
        {doneThisMonth ? <Badge className="bg-emerald-100 text-emerald-700">✅ Done {doneThisMonth.date ? format(parseISO(doneThisMonth.date), 'd MMM') : ''}</Badge> : <Badge className="bg-amber-100 text-amber-700">⚠ Due this month</Badge>}
      </div>
      {!submitted && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">All items default to ✅ Present. Tap ❌ for any missing items.</p>
          <div className="space-y-2">
            {FIRST_AID_ITEMS.map(item => (
              <div key={item.key} className={`flex items-center justify-between p-3 rounded-lg border ${present[item.key] ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <span className="text-sm flex-1">{item.label}{item.qty && <span className="text-xs text-muted-foreground ml-1">({item.qty})</span>}</span>
                <div className="flex gap-2 ml-3">
                  <button type="button" onClick={() => setPresent(p => ({ ...p, [item.key]: true }))}
                    className={`w-10 h-8 rounded text-sm font-bold border-2 ${present[item.key] ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'}`}>✅</button>
                  <button type="button" onClick={() => setPresent(p => ({ ...p, [item.key]: false }))}
                    className={`w-10 h-8 rounded text-sm font-bold border-2 ${!present[item.key] ? 'border-red-500 bg-red-500 text-white' : 'border-border'}`}>❌</button>
                </div>
              </div>
            ))}
          </div>
          {missingItems.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-red-800">🔴 Missing items ({missingItems.length}):</p>
              <ul className="mt-1 space-y-0.5">{missingItems.map(i => <li key={i.key} className="text-sm text-red-700">• {i.label}</li>)}</ul>
              <p className="text-xs text-red-600 mt-2">Admin will be notified by email on save.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Completed by *</Label><Input value={performedBy} onChange={e => setPerformedBy(e.target.value)} placeholder="Your name" className="mt-1" /></div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">Save First Aid Check</Button>
        </div>
      )}
      {submitted && <p className="text-sm text-emerald-600 font-medium">✅ Saved successfully</p>}
      <SectionHistory records={records} checkItemName="First Aid Kit Check" columns={['Date', 'Result', 'Missing Items', 'By']}
        renderRow={r => (
          <TableRow key={r.id}>
            <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
            <TableCell className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</TableCell>
            <TableCell className={`text-sm ${r.result !== 'pass' ? 'text-red-600' : 'text-emerald-600'}`}>{r.notes || '—'}</TableCell>
            <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
          </TableRow>
        )}
      />
    </Card>
  );
}

function WorkplaceInspectionCheck({ records, now, selectedMonth, onSave, saving }) {
  const today = format(now, 'yyyy-MM-dd');
  const [answers, setAnswers] = useState({});
  const [location, setLocation] = useState('');
  const [hazardNotes, setHazardNotes] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [date, setDate] = useState(today);
  const [submitted, setSubmitted] = useState(false);
  const doneThisMonth = records.find(r => r.check_item_name === 'Workplace Inspection' && r.date?.startsWith(selectedMonth));

  const answeredCount = WORKPLACE_INSPECTION_ITEMS.filter(i => answers[i]).length;
  const failedItems = WORKPLACE_INSPECTION_ITEMS.filter(i => answers[i] === 'no');
  const allAnswered = answeredCount === WORKPLACE_INSPECTION_ITEMS.length;

  const handleSave = async () => {
    if (!allAnswered) { toast.error(`Please answer all items (${answeredCount}/${WORKPLACE_INSPECTION_ITEMS.length} done)`); return; }
    if (!performedBy.trim()) { toast.error('Please enter your name'); return; }
    const notesParts = [];
    if (location.trim()) notesParts.push(`Location: ${location.trim()}`);
    notesParts.push(failedItems.length === 0 ? 'All items passed' : `Issues: ${failedItems.join('; ')}`);
    if (hazardNotes.trim()) notesParts.push(`Additional hazards identified: ${hazardNotes.trim()}`);
    try {
      await onSave([{
        maintenance_type: 'monthly_check', check_item_name: 'Workplace Inspection', equipment_name: 'Workplace',
        date, result: failedItems.length === 0 ? 'pass' : 'needs_attention',
        notes: notesParts.join(' | '), performed_by: performedBy.trim(),
        requires_followup: failedItems.length > 0, status: 'completed',
      }]);
      toast.success('Workplace inspection saved');
      setSubmitted(true);
    } catch (err) {
      toast.error(err.message || 'Failed to save workplace inspection');
    }
  };

  return (
    <Card className={`p-5 border-2 space-y-4 ${doneThisMonth ? 'border-emerald-300' : 'border-amber-300'}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">🏭 Workplace Inspection</h3>
        {doneThisMonth ? <Badge className="bg-emerald-100 text-emerald-700">✅ Done {doneThisMonth.date ? format(parseISO(doneThisMonth.date), 'd MMM') : ''}</Badge> : <Badge className="bg-amber-100 text-amber-700">⚠ Due this month</Badge>}
      </div>
      {!submitted && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Distillery floor" className="mt-1" /></div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">{answeredCount} of {WORKPLACE_INSPECTION_ITEMS.length} items answered</span>
              <span className="text-muted-foreground">{Math.round(answeredCount / WORKPLACE_INSPECTION_ITEMS.length * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${answeredCount / WORKPLACE_INSPECTION_ITEMS.length * 100}%` }} /></div>
          </div>

          {WORKPLACE_INSPECTION_SECTIONS.map(({ section, items }) => (
            <div key={section} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</h4>
              <div className="space-y-1.5">
                {items.map(item => (
                  <div key={item} className={`flex items-center justify-between gap-3 p-2 rounded-md ${answers[item] === 'no' ? 'bg-red-50' : ''}`}>
                    <span className="text-sm flex-1">{item}</span>
                    <YesNoNA value={answers[item]} onChange={v => setAnswers(a => ({ ...a, [item]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {failedItems.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-red-800">🔴 Issues found ({failedItems.length}) — flagged for follow-up:</p>
              <ul className="mt-1 space-y-0.5">{failedItems.map(i => <li key={i} className="text-sm text-red-700">• {i}</li>)}</ul>
            </div>
          )}

          <div><Label className="text-xs font-semibold">Additional hazards identified (optional)</Label><Textarea value={hazardNotes} onChange={e => setHazardNotes(e.target.value)} rows={2} className="mt-1" placeholder="Describe anything not covered above" /></div>
          <div><Label className="text-xs font-semibold">Completed by *</Label><Input value={performedBy} onChange={e => setPerformedBy(e.target.value)} placeholder="Your name" className="mt-1" /></div>
          <Button onClick={handleSave} disabled={saving} className="w-full">Save Workplace Inspection</Button>
        </div>
      )}
      {submitted && <p className="text-sm text-emerald-600 font-medium">✅ Saved successfully</p>}
      <SectionHistory records={records} checkItemName="Workplace Inspection" columns={['Date', 'Result', 'Details', 'By']}
        renderRow={r => (
          <TableRow key={r.id}>
            <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
            <TableCell className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-md">{r.notes || '—'}</TableCell>
            <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
          </TableRow>
        )}
      />
    </Card>
  );
}

function FireExtinguisherLog({ records, onSave, saving }) {
  const now = new Date();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: format(now, 'yyyy-MM-dd'), company: '', technician: '', invoice_number: '', notes: '' });
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const feRecords = useMemo(() => records.filter(r => r.maintenance_type === 'fire_extinguisher_service').sort((a, b) => (b.date || '').localeCompare(a.date || '')), [records]);
  const paged = feRecords.slice((page - 1) * pageSize, page * pageSize);

  const handleSave = async () => {
    if (!form.company.trim()) { toast.error('Please enter the service company name'); return; }
    try {
      await onSave([{ maintenance_type: 'fire_extinguisher_service', check_item_name: 'Fire Extinguisher Service', equipment_name: 'Fire Extinguisher', date: form.date, result: 'pass', certifier_company: form.company.trim(), inspector_name: form.technician || undefined, certificate_number: form.invoice_number || undefined, notes: [form.company, form.technician && `Technician: ${form.technician}`, form.invoice_number && `Invoice/Slip: ${form.invoice_number}`, form.notes].filter(Boolean).join(' | '), status: 'completed' }]);
      toast.success('Fire extinguisher service record saved');
      setShowForm(false);
      setForm({ date: format(now, 'yyyy-MM-dd'), company: '', technician: '', invoice_number: '', notes: '' });
    } catch (err) {
      toast.error(err.message || 'Failed to save fire extinguisher service record');
    }
  };

  return (
    <Card className="p-5 border-2 border-slate-200 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500" /><h3 className="font-semibold">Fire Extinguisher Service Records</h3></div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)} className="gap-1"><Plus className="w-4 h-4" /> Add Service Record</Button>
      </div>
      <p className="text-xs text-muted-foreground">Log when an external company services the fire extinguishers. Not a fixed monthly check.</p>
      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Date of Service *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Company Name *</Label><Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. FireSafe NZ" className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Technician Name</Label><Input value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))} placeholder="Optional" className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Invoice / Service Slip No.</Label><Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="e.g. INV-2026-001" className="mt-1" /></div>
          </div>
          <div><Label className="text-xs font-semibold">Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" /></div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">Save Service Record</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {feRecords.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No fire extinguisher service records yet</p>
      ) : (
        <>
          <div className="overflow-x-auto border rounded-lg">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Company</TableHead><TableHead>Technician</TableHead><TableHead>Invoice / Slip No.</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {paged.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm">{r.certifier_company || '—'}</TableCell>
                    <TableCell className="text-sm">{r.inspector_name || '—'}</TableCell>
                    <TableCell className="text-sm font-mono">{r.certificate_number || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.notes?.split(' | ').slice(3).join(' | ') || r.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination total={feRecords.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={() => {}} />
        </>
      )}
    </Card>
  );
}

export default function MonthlyChecksTab({ records, onCreate, saving }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(now, 'yyyy-MM'));
  const monthlyCheckRecords = useMemo(() => records.filter(r => ['monthly_check', 'fire_extinguisher_service'].includes(r.maintenance_type)), [records]);
  const TRACKED = ['Still Condition Inspection', 'Condenser Check', 'First Aid Kit Check', 'Workplace Inspection'];
  const completedCount = TRACKED.filter(item => records.some(r => r.maintenance_type === 'monthly_check' && r.check_item_name === item && r.date?.startsWith(selectedMonth))).length;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <CalendarCheck className="w-5 h-5 text-primary" />
          <div><Label className="text-xs">Month</Label><Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-40" /></div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">{completedCount} of {TRACKED.length} checks completed this month</span>
            <span className="text-muted-foreground">{Math.round(completedCount / TRACKED.length * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${completedCount / TRACKED.length * 100}%` }} /></div>
        </div>
      </Card>
      <StillCheck records={monthlyCheckRecords} now={now} selectedMonth={selectedMonth} onSave={onCreate} saving={saving} />
      <CondenserCheck records={monthlyCheckRecords} now={now} selectedMonth={selectedMonth} onSave={onCreate} saving={saving} />
      <FirstAidCheck records={monthlyCheckRecords} now={now} selectedMonth={selectedMonth} onSave={onCreate} saving={saving} />
      <WorkplaceInspectionCheck records={monthlyCheckRecords} now={now} selectedMonth={selectedMonth} onSave={onCreate} saving={saving} />
      <FireExtinguisherLog records={monthlyCheckRecords} onSave={onCreate} saving={saving} />
    </div>
  );
}