import { useState, useMemo } from 'react';
import { format, subDays, parseISO, isAfter } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '@/components/ui/Pagination';
import { CheckCircle2, Wrench, FlaskConical, Droplets, Filter, User, ChevronDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const SPRINGS_DISPLAY = {
  pass: { label: '✅ Pass', cls: 'text-emerald-600' },
  oiled_resolved: { label: '🛢 Oiled — OK', cls: 'text-emerald-600' },
  oiled_unresolved: { label: '⚠ Oiled — Monitor', cls: 'text-amber-600' },
  not_resolved: { label: '🔴 Not Resolved', cls: 'text-red-600' },
};

const ALCOHOL_DISPLAY = {
  good: { label: '✅ Good', cls: 'text-emerald-600' },
  change_required: { label: '🔄 Change Required', cls: 'text-amber-600' },
  changed_today: { label: '⚠ Changed Today', cls: 'text-blue-600' },
};

const BTN = "h-12 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2";

export default function PreUseChecksTab({ records, onCreate, saving }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayCheck = records.find(r => r.maintenance_type === 'pre_use_check' && r.date === todayStr);
  const [forceShowForm, setForceShowForm] = useState(false);
  const showForm = forceShowForm || !todayCheck;

  const [springs, setSprings] = useState(null);
  const [showSpringsActions, setShowSpringsActions] = useState(false);
  const [springsNotes, setSpringsNotes] = useState('');
  const [washAbv, setWashAbv] = useState('');
  const [alcohol, setAlcohol] = useState(null);
  const [filterCleaned, setFilterCleaned] = useState(null);
  const [performedBy, setPerformedBy] = useState('');

  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const preUseRecords = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    return records
      .filter(r => r.maintenance_type === 'pre_use_check' && r.date && isAfter(parseISO(r.date), cutoff))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [records]);

  const paginated = preUseRecords.slice((page - 1) * pageSize, page * pageSize);
  const canSubmit = springs && washAbv && alcohol && filterCleaned !== null && performedBy.trim() && !saving;

  const resetForm = () => {
    setSprings(null); setShowSpringsActions(false); setSpringsNotes('');
    setWashAbv(''); setAlcohol(null); setFilterCleaned(null); setPerformedBy('');
  };

  const handleSubmit = async () => {
    const requires_followup = springs === 'oiled_unresolved' || springs === 'not_resolved' || alcohol === 'change_required';
    const checkRecord = {
      equipment_name: 'Bottle Washer',
      maintenance_type: 'pre_use_check',
      date: todayStr,
      check_springs: springs,
      wash_abv: parseFloat(washAbv),
      alcohol_condition: alcohol,
      filter_cleaned: filterCleaned === true,
      performed_by: performedBy.trim(),
      requires_followup,
      status: 'completed',
      notes: springsNotes || undefined,
    };
    const recordsToCreate = [checkRecord];
    if (springs === 'not_resolved') {
      recordsToCreate.push({
        equipment_name: 'Bottle Washer',
        maintenance_type: 'repair',
        date: todayStr,
        status: 'pending',
        description: 'Spring issue found during pre-use check — bottle washer not operated',
      });
    }
    try {
      await onCreate(recordsToCreate);
      toast.success('Pre-use check submitted');
      if (springs === 'not_resolved') {
        toast.error('Bottle washer must not be operated — maintenance issue auto-logged');
      }
      resetForm();
      setForceShowForm(false);
    } catch (e) {
      toast.error('Failed to submit: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card className={`p-4 ${todayCheck ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-muted/40'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {todayCheck ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <Wrench className="w-6 h-6 text-muted-foreground" />}
            <div>
              <p className="font-semibold text-sm">{todayCheck ? '✅ Check completed today' : 'Not completed yet today'}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, d MMMM yyyy')} — optional, no compliance tracking</p>
            </div>
          </div>
          {todayCheck && !showForm && (
            <Button variant="outline" size="sm" onClick={() => setForceShowForm(true)} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Redo Check
            </Button>
          )}
        </div>
      </Card>

      {todayCheck && !showForm && (
        <Card className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Today's Check Summary</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Springs:</span> <span className={SPRINGS_DISPLAY[todayCheck.check_springs]?.cls}>{SPRINGS_DISPLAY[todayCheck.check_springs]?.label || '—'}</span></div>
            <div><span className="text-muted-foreground">Wash ABV:</span> <span className="font-mono">{todayCheck.wash_abv?.toFixed(1)}%</span></div>
            <div><span className="text-muted-foreground">Alcohol:</span> <span className={ALCOHOL_DISPLAY[todayCheck.alcohol_condition]?.cls}>{ALCOHOL_DISPLAY[todayCheck.alcohol_condition]?.label || '—'}</span></div>
            <div><span className="text-muted-foreground">Filter:</span> {todayCheck.filter_cleaned ? '✅ Cleaned' : '⏭ Not required'}</div>
            <div><span className="text-muted-foreground">By:</span> {todayCheck.performed_by}</div>
            {todayCheck.requires_followup && <div className="col-span-2"><Badge variant="destructive">⚠ Followup required</Badge></div>}
          </div>
        </Card>
      )}

      {showForm && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2"><Wrench className="w-5 h-5 text-primary" /><h3 className="font-semibold">Bottle Wash Springs</h3></div>
            <p className="text-sm text-muted-foreground">Are all springs functioning correctly?</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => { setSprings('pass'); setShowSpringsActions(false); }}
                className={`${BTN} border-2 ${springs === 'pass' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border'}`}>✅ YES — All Good</button>
              <button type="button" onClick={() => { setSprings(null); setShowSpringsActions(true); }}
                className={`${BTN} border-2 ${showSpringsActions ? 'border-red-500 bg-red-50 text-red-700' : 'border-border'}`}>❌ NO — Issue Found</button>
            </div>
            {showSpringsActions && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold uppercase text-muted-foreground">What action was taken?</p>
                {[
                  { val: 'oiled_resolved', label: '🛢 Springs Oiled — Issue Resolved' },
                  { val: 'oiled_unresolved', label: '⚠ Springs Oiled — Still Not Right' },
                  { val: 'not_resolved', label: '🔴 Issue Not Resolved — Do Not Operate' },
                ].map(opt => (
                  <button key={opt.val} type="button" onClick={() => setSprings(opt.val)}
                    className={`w-full ${BTN} border-2 ${springs === opt.val ? 'border-primary bg-primary/10' : 'border-border'}`}>{opt.label}</button>
                ))}
                {springs === 'oiled_resolved' && <p className="text-sm text-emerald-600">Issue resolved — safe to operate.</p>}
                {springs === 'oiled_unresolved' && <p className="text-sm text-amber-600">Monitor closely during operation.</p>}
                {springs === 'not_resolved' && <p className="text-sm text-red-600">Do not operate the bottle washer. A maintenance issue will be automatically logged.</p>}
                <Textarea placeholder="Notes (optional)" value={springsNotes} onChange={e => setSpringsNotes(e.target.value)} className="mt-2" rows={2} />
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2"><FlaskConical className="w-5 h-5 text-primary" /><h3 className="font-semibold">Wash ABV</h3></div>
            <p className="text-sm text-muted-foreground">Current ABV of wash solution</p>
            <div className="flex items-center gap-2">
              <Input type="number" step="0.1" min="0" max="100" value={washAbv} onChange={e => setWashAbv(e.target.value)} placeholder="0.0" className="w-32 h-12 text-lg font-mono" />
              <span className="text-lg font-semibold">%</span>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2"><Droplets className="w-5 h-5 text-primary" /><h3 className="font-semibold">Alcohol Condition</h3></div>
            <p className="text-sm text-muted-foreground">Does the alcohol need changing out?</p>
            <div className="space-y-2">
              {[
                { val: 'good', label: '✅ Good — No Change Needed' },
                { val: 'change_required', label: '🔄 Change Required' },
                { val: 'changed_today', label: '⚠ Changed Out Today' },
              ].map(opt => (
                <button key={opt.val} type="button" onClick={() => setAlcohol(opt.val)}
                  className={`w-full ${BTN} border-2 ${alcohol === opt.val ? 'border-primary bg-primary/10' : 'border-border'}`}>{opt.label}</button>
              ))}
            </div>
            {alcohol === 'change_required' && <p className="text-sm text-amber-600">Schedule alcohol change before next use.</p>}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2"><Filter className="w-5 h-5 text-primary" /><h3 className="font-semibold">Filter</h3></div>
            <p className="text-sm text-muted-foreground">Was the filter cleaned today?</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setFilterCleaned(true)}
                className={`${BTN} border-2 ${filterCleaned === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border'}`}>✅ Yes — Filter Cleaned</button>
              <button type="button" onClick={() => setFilterCleaned(false)}
                className={`${BTN} border-2 ${filterCleaned === false ? 'border-border bg-muted' : 'border-border'}`}>⏭ No — Not Required Today</button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2"><User className="w-5 h-5 text-primary" /><h3 className="font-semibold">Completed by</h3></div>
            <Input value={performedBy} onChange={e => setPerformedBy(e.target.value)} placeholder="Staff name" className="h-12" />
          </Card>

          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full h-14 text-base font-bold gap-2">✅ SUBMIT PRE-USE CHECK</Button>
        </div>
      )}

      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/50">
            <span className="font-semibold text-sm">Recent Pre-Use Checks (last 30 days)</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Springs</TableHead><TableHead>ABV</TableHead><TableHead>Alcohol</TableHead><TableHead>Filter</TableHead><TableHead>By</TableHead><TableHead>Followup</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No pre-use checks in the last 30 days</TableCell></TableRow>
                  ) : paginated.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM') : '—'}</TableCell>
                      <TableCell className={`text-sm ${SPRINGS_DISPLAY[r.check_springs]?.cls || ''}`}>{SPRINGS_DISPLAY[r.check_springs]?.label || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{r.wash_abv?.toFixed(1) || '—'}%</TableCell>
                      <TableCell className={`text-sm ${ALCOHOL_DISPLAY[r.alcohol_condition]?.cls || ''}`}>{ALCOHOL_DISPLAY[r.alcohol_condition]?.label || '—'}</TableCell>
                      <TableCell className="text-sm">{r.filter_cleaned ? '✅' : '⏭'}</TableCell>
                      <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
                      <TableCell>{r.requires_followup ? <Badge variant="destructive">⚠ Followup</Badge> : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="p-4"><Pagination total={preUseRecords.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}