import { useState, useMemo } from 'react';
import { format, parseISO, addYears, addMonths, differenceInDays } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '@/components/ui/Pagination';
import { ChevronDown, AlertTriangle, Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const RESULT_CLS = { pass: 'text-emerald-600', fail: 'text-red-600', needs_attention: 'text-amber-600', conditional_pass: 'text-amber-600' };
const RESULT_LABEL = { pass: '✅ Pass', fail: '❌ Fail', needs_attention: '⚠ Needs Attention', conditional_pass: '⚠ Conditional Pass' };
const BORDER = { green: 'border-emerald-300', amber: 'border-amber-300', red: 'border-red-300' };

function getStatus(records, checkItemName) {
  const matching = records.filter(r => r.maintenance_type === 'yearly_check' && r.check_item_name === checkItemName).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latest = matching[0] || null;
  if (!latest) return { status: 'red', latest: null, label: 'Never inspected', all: matching };
  if (!latest.next_due_date) return { status: 'amber', latest, label: 'No due date set', all: matching };
  const days = differenceInDays(parseISO(latest.next_due_date), new Date());
  if (days < 0) return { status: 'red', latest, label: `Overdue by ${Math.abs(days)} days`, all: matching };
  if (days <= 60) return { status: 'amber', latest, label: `Due in ${days} days`, all: matching };
  return { status: 'green', latest, label: `Next due in ${days} days`, all: matching };
}

const STATUS_CLS = { green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600' };

// ─── EMERGENCY EXITS ─────────────────────────────────────────────────────────
function EmergencyExitsCard({ records, onSave, saving }) {
  const now = new Date();
  const { status, latest, label, all } = getStatus(records, 'Emergency Exits & Signage');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ exits_marked: null, signs_illuminated: null, paths_clear: null, signage_condition: null, notes: '', performed_by: '', date: format(now, 'yyyy-MM-dd') });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(1);

  const handleSave = async () => {
    if ([form.exits_marked, form.signs_illuminated, form.paths_clear, form.signage_condition].some(v => v === null)) { toast.error('Please answer all checks'); return; }
    if (!form.performed_by.trim()) { toast.error('Please enter your name'); return; }
    const allGood = form.exits_marked && form.signs_illuminated && form.paths_clear && form.signage_condition;
    const issues = [];
    if (!form.exits_marked) issues.push('Exits not clearly marked');
    if (!form.signs_illuminated) issues.push('Exit signs not illuminated');
    if (!form.paths_clear) issues.push('Paths to exits not clear');
    if (!form.signage_condition) issues.push('Signage in poor condition');
    const notesParts = [`Exits marked: ${form.exits_marked ? 'Yes' : 'No'}`, `Signs illuminated: ${form.signs_illuminated ? 'Yes' : 'No'}`, `Paths clear: ${form.paths_clear ? 'Yes' : 'No'}`, `Signage condition: ${form.signage_condition ? 'Good' : 'Poor'}`];
    if (form.notes) notesParts.push(`Notes: ${form.notes}`);
    try {
      await onSave([{ maintenance_type: 'yearly_check', check_item_name: 'Emergency Exits & Signage', equipment_name: 'Emergency Exits', date: form.date, result: allGood ? 'pass' : 'needs_attention', notes: notesParts.join(' | '), performed_by: form.performed_by.trim(), requires_followup: !allGood, status: 'completed', next_due_date: format(addYears(now, 1), 'yyyy-MM-dd') }]);
      toast.success('Emergency exits check saved');
      setShowForm(false);
    } catch (err) {
      toast.error(err.message || 'Failed to save emergency exits check');
    }
  };

  return (
    <Card className={`p-5 border-2 ${BORDER[status]} space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-semibold">🚪 Emergency Exits & Signage Check</h3>
          {latest ? (
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              <p>Last done: {latest.date ? format(parseISO(latest.date), 'd MMM yyyy') : '—'} by {latest.performed_by || '—'}</p>
              <p className={STATUS_CLS[status]}>{label}</p>
            </div>
          ) : <p className={`text-xs mt-1 ${STATUS_CLS[status]}`}>{label}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)} className="gap-1 shrink-0"><Plus className="w-4 h-4" /> Log Check</Button>
      </div>
      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          {[['exits_marked','All exits clearly marked'],['signs_illuminated','Exit signs illuminated'],['paths_clear','Paths to exits clear'],['signage_condition','Signage in good condition']].map(([key, lbl]) => (
            <div key={key}>
              <Label className="text-xs font-semibold">{lbl}</Label>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => setForm(f => ({ ...f, [key]: true }))} className={`flex-1 h-11 rounded-lg text-sm font-medium border-2 ${form[key] === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border'}`}>✅ Yes</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, [key]: false }))} className={`flex-1 h-11 rounded-lg text-sm font-medium border-2 ${form[key] === false ? 'border-red-500 bg-red-50 text-red-700' : 'border-border'}`}>❌ No</button>
              </div>
            </div>
          ))}
          <div><Label className="text-xs font-semibold">Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Completed by *</Label><Input value={form.performed_by} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))} placeholder="Your name" className="mt-1" /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">Save Check</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {all.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
            <ChevronDown className={`w-3 h-3 transition-transform ${historyOpen ? 'rotate-180' : ''}`} /> View {all.length} previous checks
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="overflow-x-auto border rounded mt-2">
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Result</TableHead><TableHead>By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>{all.slice((page-1)*10, page*10).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</TableCell>
                    <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{r.notes || '—'}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            <Pagination total={all.length} page={page} pageSize={10} onPageChange={setPage} onPageSizeChange={() => {}} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}

// ─── PALLET JACK ─────────────────────────────────────────────────────────────
function PalletJackCard({ records, onSave, saving }) {
  const now = new Date();
  const { status, latest, label, all } = getStatus(records, 'Pallet Jack Inspection');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ forks: null, hydraulic: null, wheels: null, markings: null, overall: null, notes: '', performed_by: '', date: format(now, 'yyyy-MM-dd') });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(1);

  const handleSave = async () => {
    if ([form.forks, form.hydraulic, form.wheels, form.markings, form.overall].some(v => v === null)) { toast.error('Please complete all fields'); return; }
    if (!form.performed_by.trim()) { toast.error('Please enter your name'); return; }
    const removeFromService = form.overall === 'remove';
    const result = removeFromService ? 'fail' : form.overall === 'monitor' ? 'needs_attention' : 'pass';
    const notesParts = [`Forks: ${form.forks}`, `Hydraulic: ${form.hydraulic === 'working' ? 'Working' : 'Not Working'}`, `Wheels: ${form.wheels}`, `Markings: ${form.markings === 'yes' ? 'Visible' : 'Not Visible'}`, `Overall: ${form.overall}`];
    if (form.notes) notesParts.push(`Notes: ${form.notes}`);
    try {
      await onSave([{ maintenance_type: 'yearly_check', check_item_name: 'Pallet Jack Inspection', equipment_name: 'Pallet Jack', date: form.date, result, notes: notesParts.join(' | '), performed_by: form.performed_by.trim(), requires_followup: removeFromService, status: 'completed', next_due_date: format(addYears(now, 1), 'yyyy-MM-dd') }]);
      if (removeFromService) toast.error('Pallet jack removed from service — follow-up required');
      else toast.success('Pallet jack inspection saved');
      setShowForm(false);
    } catch (err) {
      toast.error(err.message || 'Failed to save pallet jack inspection');
    }
  };

  return (
    <Card className={`p-5 border-2 ${BORDER[status]} space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-semibold">🏭 Pallet Jack Inspection (In-house)</h3>
          {latest ? (
            <div className="text-xs text-muted-foreground mt-1">
              <p>Last done: {latest.date ? format(parseISO(latest.date), 'd MMM yyyy') : '—'} by {latest.performed_by || '—'}</p>
              <p className={STATUS_CLS[status]}>{label}</p>
            </div>
          ) : <p className={`text-xs mt-1 ${STATUS_CLS[status]}`}>{label}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)} className="gap-1 shrink-0"><Plus className="w-4 h-4" /> Log Inspection</Button>
      </div>
      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div>
            <Label className="text-xs font-semibold">Forks Condition</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[['good','✅ Good'],['worn','⚠ Worn'],['damaged','❌ Damaged']].map(([v,lbl]) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, forks: v }))} className={`h-11 rounded-lg text-xs font-medium border-2 ${form.forks === v ? 'border-primary bg-primary/10' : 'border-border'}`}>{lbl}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Hydraulic Function</Label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setForm(f => ({ ...f, hydraulic: 'working' }))} className={`flex-1 h-11 rounded-lg text-sm font-medium border-2 ${form.hydraulic === 'working' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border'}`}>✅ Working</button>
              <button type="button" onClick={() => setForm(f => ({ ...f, hydraulic: 'not_working' }))} className={`flex-1 h-11 rounded-lg text-sm font-medium border-2 ${form.hydraulic === 'not_working' ? 'border-red-500 bg-red-50 text-red-700' : 'border-border'}`}>❌ Not Working</button>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Wheels / Castors</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[['good','✅ Good'],['worn','⚠ Worn'],['damaged','❌ Damaged']].map(([v,lbl]) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, wheels: v }))} className={`h-11 rounded-lg text-xs font-medium border-2 ${form.wheels === v ? 'border-primary bg-primary/10' : 'border-border'}`}>{lbl}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Safety Markings Visible</Label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setForm(f => ({ ...f, markings: 'yes' }))} className={`flex-1 h-11 rounded-lg text-sm font-medium border-2 ${form.markings === 'yes' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border'}`}>✅ Yes</button>
              <button type="button" onClick={() => setForm(f => ({ ...f, markings: 'no' }))} className={`flex-1 h-11 rounded-lg text-sm font-medium border-2 ${form.markings === 'no' ? 'border-red-500 bg-red-50 text-red-700' : 'border-border'}`}>❌ No</button>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Overall Result</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[['good','✅ All Good'],['monitor','⚠ Monitor'],['remove','🔴 Remove from Service']].map(([v,lbl]) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, overall: v }))} className={`h-11 rounded-lg text-xs font-medium border-2 ${form.overall === v ? 'border-primary bg-primary/10' : 'border-border'}`}>{lbl}</button>
              ))}
            </div>
          </div>
          {form.overall === 'remove' && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">🔴 Pallet jack must not be used until inspected by a qualified technician.</div>}
          <div><Label className="text-xs font-semibold">Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Completed by *</Label><Input value={form.performed_by} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))} placeholder="Your name" className="mt-1" /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">Save Inspection</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {all.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
            <ChevronDown className={`w-3 h-3 transition-transform ${historyOpen ? 'rotate-180' : ''}`} /> View {all.length} previous inspections
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="overflow-x-auto border rounded mt-2">
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Result</TableHead><TableHead>By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>{all.slice((page-1)*10, page*10).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</TableCell>
                    <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{r.notes || '—'}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            <Pagination total={all.length} page={page} pageSize={10} onPageChange={setPage} onPageSizeChange={() => {}} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}

// ─── AUDIT CARD (used for both H&S and Food Safety) ──────────────────────────
function AuditCard({ title, icon, checkItemName, internalItems, records, onSave, onUpdate, saving }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const auditRecords = useMemo(() =>
    records.filter(r => r.maintenance_type === 'yearly_check' && r.check_item_name === checkItemName).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  [records, checkItemName]);
  const thisYearRecords = auditRecords.filter(r => r.date?.startsWith(String(currentYear)));
  const prevRecords = auditRecords.filter(r => !r.date?.startsWith(String(currentYear)));
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [auditType, setAuditType] = useState('internal');
  const [form, setForm] = useState({});
  const [prevOpen, setPrevOpen] = useState(false);
  const [page, setPage] = useState(1);

  const initForm = (type, existing) => {
    if (existing) {
      setAuditType(existing.certifier_company ? 'external' : 'internal');
      setForm({
        date: existing.date || format(now, 'yyyy-MM-dd'),
        company: existing.certifier_company || '',
        auditor: existing.inspector_name || '',
        cert_number: existing.certificate_number || '',
        result: existing.result || null,
        next_due: existing.next_due_date || '',
        performed_by: existing.performed_by || '',
        checked_items: existing.notes?.match(/Items: ([^|]+)/)?.[1]?.split(', ') || [],
        notes: existing.notes?.replace(/Items: [^|]+\|?\s?/, '') || '',
      });
    } else {
      setForm({ date: format(now, 'yyyy-MM-dd'), company: '', auditor: '', cert_number: '', result: null, next_due: format(addYears(now, 1), 'yyyy-MM-dd'), performed_by: '', checked_items: [], notes: '' });
    }
  };

  const openAdd = () => { setEditRecord(null); initForm(auditType, null); setShowForm(true); };
  const openEdit = (r) => { setEditRecord(r); initForm(null, r); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditRecord(null); };

  const handleSave = async () => {
    if (!form.result) { toast.error('Please select a result'); return; }
    if (auditType === 'external' && !form.company?.trim()) { toast.error('Please enter the auditing company'); return; }
    if (auditType === 'internal' && !form.performed_by?.trim()) { toast.error('Please enter your name'); return; }
    const notesParts = [];
    if (form.checked_items?.length > 0) notesParts.push(`Items: ${form.checked_items.join(', ')}`);
    if (form.notes) notesParts.push(form.notes);
    const payload = {
      maintenance_type: 'yearly_check', check_item_name: checkItemName, equipment_name: checkItemName,
      date: form.date, result: form.result, notes: notesParts.join(' | ') || undefined,
      inspector_name: auditType === 'external' ? form.auditor : form.performed_by,
      certifier_company: auditType === 'external' ? form.company : undefined,
      certificate_number: auditType === 'external' && form.cert_number ? form.cert_number : undefined,
      performed_by: auditType === 'internal' ? form.performed_by : form.auditor,
      next_due_date: form.next_due || undefined, status: 'completed',
    };
    try {
      if (editRecord) {
        await onUpdate(editRecord.id, payload);
        toast.success('Audit record updated');
      } else {
        await onSave([payload]);
        toast.success('Audit record saved');
      }
      closeForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save audit record');
    }
  };

  const toggleItem = (item) => {
    setForm(f => {
      const items = f.checked_items || [];
      return { ...f, checked_items: items.includes(item) ? items.filter(i => i !== item) : [...items, item] };
    });
  };

  return (
    <Card className="p-5 border-2 border-slate-200 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{icon} {title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{thisYearRecords.length} audit{thisYearRecords.length !== 1 ? 's' : ''} recorded in {currentYear}</p>
        </div>
        <Button size="sm" variant="outline" onClick={openAdd} className="gap-1 shrink-0"><Plus className="w-4 h-4" /> Add Audit</Button>
      </div>

      {thisYearRecords.length > 0 && (
        <div className="space-y-2">
          {thisYearRecords.map(r => (
            <div key={r.id} className="bg-muted/30 border border-border rounded-lg p-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</span>
                  <Badge className={r.certifier_company ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}>{r.certifier_company ? '🏢 External' : '🏠 Internal'}</Badge>
                  <span className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{r.certifier_company || r.performed_by || '—'}{r.certificate_number && ` — Ref: ${r.certificate_number}`}</p>
                {r.notes && <p className="text-xs text-muted-foreground truncate">{r.notes}</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => openEdit(r)} className="shrink-0"><Pencil className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div>
            <Label className="text-xs font-semibold">Audit type</Label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setAuditType('external')} className={`flex-1 h-11 rounded-lg text-sm font-medium border-2 ${auditType === 'external' ? 'border-primary bg-primary/10' : 'border-border'}`}>🏢 External</button>
              <button type="button" onClick={() => setAuditType('internal')} className={`flex-1 h-11 rounded-lg text-sm font-medium border-2 ${auditType === 'internal' ? 'border-primary bg-primary/10' : 'border-border'}`}>🏠 Internal</button>
            </div>
          </div>
          <div><Label className="text-xs font-semibold">Date</Label><Input type="date" value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
          {auditType === 'external' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs font-semibold">Auditing Company *</Label><Input value={form.company || ''} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs font-semibold">Auditor Name</Label><Input value={form.auditor || ''} onChange={e => setForm(f => ({ ...f, auditor: e.target.value }))} className="mt-1" /></div>
              </div>
              <div><Label className="text-xs font-semibold">Certificate / Reference No. (optional)</Label><Input value={form.cert_number || ''} onChange={e => setForm(f => ({ ...f, cert_number: e.target.value }))} className="mt-1" /></div>
              <div><Label className="text-xs font-semibold">Next Audit Due</Label><Input type="date" value={form.next_due || ''} onChange={e => setForm(f => ({ ...f, next_due: e.target.value }))} className="mt-1" /></div>
            </>
          ) : (
            <>
              <div><Label className="text-xs font-semibold">Completed by *</Label><Input value={form.performed_by || ''} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))} placeholder="Your name" className="mt-1" /></div>
              <div>
                <Label className="text-xs font-semibold">Items reviewed</Label>
                <div className="space-y-1 mt-1">
                  {internalItems.map(item => (
                    <label key={item} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={(form.checked_items || []).includes(item)} onChange={() => toggleItem(item)} className="rounded" />
                      <span className="text-sm">{item}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div><Label className="text-xs font-semibold">Next Audit Due</Label><Input type="date" value={form.next_due || ''} onChange={e => setForm(f => ({ ...f, next_due: e.target.value }))} className="mt-1" /></div>
            </>
          )}
          <div>
            <Label className="text-xs font-semibold">Result</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {auditType === 'external'
                ? [['pass','✅ Pass'],['conditional_pass','⚠ Conditional Pass'],['fail','❌ Fail']].map(([v,lbl]) => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, result: v }))} className={`h-11 rounded-lg text-sm font-medium border-2 ${form.result === v ? 'border-primary bg-primary/10' : 'border-border'}`}>{lbl}</button>
                  ))
                : [['pass','✅ Pass'],['needs_attention','⚠ Needs Attention']].map(([v,lbl]) => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, result: v }))} className={`h-11 rounded-lg text-sm font-medium border-2 ${form.result === v ? 'border-primary bg-primary/10' : 'border-border'}`}>{lbl}</button>
                  ))
              }
            </div>
          </div>
          <div><Label className="text-xs font-semibold">Findings / Notes (optional)</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="mt-1" /></div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">{editRecord ? 'Update Audit' : 'Save Audit'}</Button>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
          </div>
        </div>
      )}

      {prevRecords.length > 0 && (
        <Collapsible open={prevOpen} onOpenChange={setPrevOpen}>
          <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
            <ChevronDown className={`w-3 h-3 transition-transform ${prevOpen ? 'rotate-180' : ''}`} /> Previous years ({prevRecords.length} records)
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="overflow-x-auto border rounded mt-2">
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Result</TableHead><TableHead>By / Company</TableHead><TableHead>Ref</TableHead></TableRow></TableHeader>
                <TableBody>{prevRecords.slice((page-1)*10, page*10).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm">{r.certifier_company ? '🏢 External' : '🏠 Internal'}</TableCell>
                    <TableCell className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</TableCell>
                    <TableCell className="text-sm">{r.certifier_company || r.performed_by || '—'}</TableCell>
                    <TableCell className="text-sm font-mono">{r.certificate_number || '—'}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            <Pagination total={prevRecords.length} page={page} pageSize={10} onPageChange={setPage} onPageSizeChange={() => {}} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}

const HS_ITEMS = ['Hazard register reviewed','Incident log reviewed','Staff training records checked','PPE stock checked','Emergency procedures reviewed','Chemical safety data sheets checked'];
const FS_ITEMS = ['HACCP plan reviewed','Temperature records checked','Cleaning schedules verified','Allergen controls checked','Supplier records reviewed','Traceability records checked','Staff food safety training current'];

export default function YearlyChecksTab({ records, onCreate, onUpdate, saving }) {
  const yearlyRecords = useMemo(() => records.filter(r => r.maintenance_type === 'yearly_check'), [records]);
  const CHECKS = ['Emergency Exits & Signage','Pallet Jack Inspection','Health & Safety Audit','Food Safety Audit'];
  const overdueCount = CHECKS.filter(c => getStatus(records, c).status === 'red').length;

  const handleUpdate = onUpdate || (async () => {});

  return (
    <div className="space-y-4">
      {overdueCount > 0 && (
        <Card className="p-4 border-2 border-red-300 bg-red-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <p className="font-semibold text-sm text-red-800">🔴 {overdueCount} safety {overdueCount === 1 ? 'check is' : 'checks are'} overdue — action required.</p>
          </div>
        </Card>
      )}
      <EmergencyExitsCard records={yearlyRecords} onSave={onCreate} saving={saving} />
      <PalletJackCard records={yearlyRecords} onSave={onCreate} saving={saving} />
      <AuditCard title="Health & Safety Audit" icon="🦺" checkItemName="Health & Safety Audit" internalItems={HS_ITEMS} records={yearlyRecords} onSave={onCreate} onUpdate={handleUpdate} saving={saving} />
      <AuditCard title="Food Safety Audit" icon="🍽" checkItemName="Food Safety Audit" internalItems={FS_ITEMS} records={yearlyRecords} onSave={onCreate} onUpdate={handleUpdate} saving={saving} />
    </div>
  );
}