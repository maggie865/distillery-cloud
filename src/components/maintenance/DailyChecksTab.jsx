import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { YesNo, CollapsibleCheckCard, SectionHistory } from './MonthlyChecksTab';

const RESULT_CLS = { pass: 'text-emerald-600', fail: 'text-red-600', needs_attention: 'text-amber-600' };
const RESULT_LABEL = { pass: '✅ Pass', fail: '❌ Fail', needs_attention: '⚠ Needs Attention' };

const STILL_PRE_USE_ITEMS = [
  { key: 'heating_element', label: 'Heating element secure and undamaged' },
  { key: 'cables_plugs_sockets', label: 'No damaged cables, plugs or sockets' },
  { key: 'no_overheating', label: 'No evidence of overheating, scorching or discolouration' },
  { key: 'no_leaks', label: 'No liquid leaks onto electrical equipment' },
  { key: 'ventilation', label: 'Ventilation operating' },
  { key: 'rcd_functional', label: 'RCD functional' },
];

// Daily/before-use operator check — same shape as the monthly Still checks
// (CollapsibleCheckCard/SectionHistory/YesNo, imported from MonthlyChecksTab
// rather than duplicated), but keyed to "done today" rather than "done this
// month", matching how a before-use check is actually performed.
function StillPreUseCheck({ records, now, onSave, saving }) {
  const today = format(now, 'yyyy-MM-dd');
  const blank = Object.fromEntries(STILL_PRE_USE_ITEMS.map(i => [i.key, null]));
  const [form, setForm] = useState({ ...blank, notes: '', performed_by: '', date: today });
  const [submitted, setSubmitted] = useState(false);
  const doneToday = records.find(r => r.check_item_name === 'Still Pre-Use Operator Check' && r.date === today);

  const handleSave = async () => {
    if (STILL_PRE_USE_ITEMS.some(i => form[i.key] === null)) { toast.error('Please answer all checks'); return; }
    if (!form.performed_by.trim()) { toast.error('Please enter your name'); return; }
    const allGood = STILL_PRE_USE_ITEMS.every(i => form[i.key]);
    const notesParts = STILL_PRE_USE_ITEMS.map(i => `${i.label}: ${form[i.key] ? 'Good' : 'Issue Found'}`);
    if (form.notes) notesParts.push(`Notes: ${form.notes}`);
    try {
      await onSave([{ maintenance_type: 'pre_use_check', check_item_name: 'Still Pre-Use Operator Check', equipment_name: 'Still', date: form.date, result: allGood ? 'pass' : 'needs_attention', notes: notesParts.join(' | '), performed_by: form.performed_by.trim(), requires_followup: !allGood, status: 'completed' }]);
      toast.success('Still pre-use check saved');
      setSubmitted(true);
    } catch (err) {
      toast.error(err.message || 'Failed to save still pre-use check');
    }
  };

  const hasIssue = STILL_PRE_USE_ITEMS.some(i => form[i.key] === false);

  return (
    <CollapsibleCheckCard
      icon="🔥" title="Still Pre-Use Operator Check"
      borderClass={doneToday ? 'border-emerald-300' : 'border-amber-300'}
      badge={doneToday ? <Badge className="bg-emerald-100 text-emerald-700">✅ Done today</Badge> : <Badge className="bg-amber-100 text-amber-700">⚠ Not done today</Badge>}
    >
      {!submitted && (
        <div className="space-y-4">
          {STILL_PRE_USE_ITEMS.map(item => (
            <div key={item.key}>
              <Label className="text-xs font-semibold">{item.label}</Label>
              <div className="mt-1"><YesNo value={form[item.key]} onChange={v => setForm(f => ({ ...f, [item.key]: v }))} /></div>
            </div>
          ))}
          {hasIssue && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">⚠ Issues found — do not operate the still until this is resolved. This record will be flagged for follow-up.</div>
          )}
          <div><Label className="text-xs font-semibold">Additional Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-semibold">Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs font-semibold">Completed by *</Label><Input value={form.performed_by} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))} placeholder="Your name" className="mt-1" /></div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">Save Pre-Use Check</Button>
        </div>
      )}
      {submitted && <p className="text-sm text-emerald-600 font-medium">✅ Saved successfully</p>}
      <SectionHistory records={records} checkItemName="Still Pre-Use Operator Check" columns={['Date', 'Summary', 'Result', 'By', 'Notes']}
        renderRow={r => (
          <TableRow key={r.id}>
            <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
            <TableCell className="text-sm">{r.notes?.split(' | ').slice(0, STILL_PRE_USE_ITEMS.length).join(', ') || '—'}</TableCell>
            <TableCell className={`text-sm ${RESULT_CLS[r.result] || ''}`}>{RESULT_LABEL[r.result] || '—'}</TableCell>
            <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.notes?.split(' | ').slice(STILL_PRE_USE_ITEMS.length).join(' | ') || '—'}</TableCell>
          </TableRow>
        )}
      />
    </CollapsibleCheckCard>
  );
}

export default function DailyChecksTab({ records, onCreate, saving }) {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const preUseRecords = useMemo(() => records.filter(r => r.maintenance_type === 'pre_use_check'), [records]);
  const doneToday = preUseRecords.some(r => r.check_item_name === 'Still Pre-Use Operator Check' && r.date === today);

  return (
    <div className="space-y-4">
      {!doneToday && (
        <Card className="p-4 border-2 border-amber-300 bg-amber-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="font-semibold text-sm text-amber-800">⚠ Still pre-use check not yet done today.</p>
          </div>
        </Card>
      )}
      <StillPreUseCheck records={preUseRecords} now={now} onSave={onCreate} saving={saving} />
    </div>
  );
}
