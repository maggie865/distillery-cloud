import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Pencil, GraduationCap, StickyNote, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const EMPLOYMENT_LABELS = { permanent: 'Permanent', part_time: 'Part-time', casual: 'Casual' };
const todayStr = () => new Date().toISOString().split('T')[0];

function expiryBadge(expiryDate) {
  if (!expiryDate) return null;
  const days = (new Date(expiryDate) - new Date(todayStr())) / 86400000;
  if (days < 0) return <Badge className="bg-red-100 text-red-700 text-xs">Expired</Badge>;
  if (days <= 30) return <Badge className="bg-amber-100 text-amber-700 text-xs">Expires soon</Badge>;
  return null;
}

// Local field state per row so typing doesn't touch the parent on every
// keystroke - date/initials save on blur, the checkbox saves immediately
// (that IS the "tick when signed off" action). Keyed by the signoff's
// updated_at in the parent so a real save round-trip remounts this with
// fresh values, without disrupting an in-progress edit.
//
// No per-item trainer field - the trainer is assumed the same for the
// whole form (see the Trainer field on the program card above) and gets
// carried into every item's signoff automatically when it's ticked.
function TrainingItemRow({ item, signoff, onToggle, onFieldSave, saving }) {
  const [dateCompleted, setDateCompleted] = useState(signoff?.date_completed || '');
  const [initials, setInitials] = useState(signoff?.staff_initials || '');
  const [expiry, setExpiry] = useState(signoff?.expiry_date || '');
  const [notes, setNotes] = useState(signoff?.notes || '');
  const [notesOpen, setNotesOpen] = useState(false);
  const completed = signoff?.completed || false;
  const hasNoteContent = !!(signoff?.notes || signoff?.requires_followup);

  return (
    <div className={`rounded-md ${completed ? 'bg-emerald-50/50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 p-2">
        <Checkbox checked={completed} onCheckedChange={(v) => onToggle(!!v)} disabled={saving} className="shrink-0" />
        <div className="flex-1 min-w-[180px]">
          <span className="text-sm">{item.label}</span>
          {completed && signoff?.trainer && <p className="text-xs text-muted-foreground">Signed off by {signoff.trainer}</p>}
        </div>
        <Input
          type="date" value={dateCompleted} onChange={e => setDateCompleted(e.target.value)} onBlur={() => onFieldSave({ date_completed: dateCompleted || null })}
          className="h-8 text-xs w-36"
        />
        <Input
          value={initials} onChange={e => setInitials(e.target.value)} onBlur={() => onFieldSave({ staff_initials: initials.trim() || null })}
          placeholder="Initials" className="h-8 text-xs w-16"
        />
        {item.is_certification && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date" value={expiry} onChange={e => setExpiry(e.target.value)} onBlur={() => onFieldSave({ expiry_date: expiry || null })}
              className="h-8 text-xs w-36" title="Expiry date"
            />
            {expiryBadge(signoff?.expiry_date)}
          </div>
        )}
        {signoff?.requires_followup && <Badge className="bg-red-100 text-red-700 text-xs gap-1"><AlertTriangle className="w-3 h-3" /> Follow-up</Badge>}
        <button
          type="button" onClick={() => setNotesOpen(v => !v)} title="Notes / follow-up"
          className={`shrink-0 p-1.5 rounded-md transition-colors ${hasNoteContent ? 'text-amber-600 hover:text-amber-700' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <StickyNote className={`w-4 h-4 ${hasNoteContent ? 'fill-amber-100' : ''}`} />
        </button>
      </div>
      {notesOpen && (
        <div className="px-2 pb-2 pl-9 space-y-2">
          <Textarea
            value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => onFieldSave({ notes: notes.trim() || null })}
            rows={2} placeholder="Notes on this area — observations, what still needs work, etc." className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Checkbox checked={signoff?.requires_followup || false} onCheckedChange={(v) => onFieldSave({ requires_followup: !!v })} />
            <Label className="text-xs font-normal text-muted-foreground">Flag for follow-up</Label>
          </div>
        </div>
      )}
    </div>
  );
}

const BLANK_REFRESHER = { date: todayStr(), topic: '', delivered_by: '', staff_initials: '', notes: '' };

// Refresher / ongoing training: toolbox topics, updates, or a re-run of an
// existing area - repeatable log entries, not tied to a fixed checklist
// item (unlike the programs above, the same topic can reasonably be
// logged more than once over time).
function RefresherLog({ staffId }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_REFRESHER);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['trainingRefresherLog', staffId],
    queryFn: async () => (await db.TrainingRefresherLog.list('-date', 1000)).filter(e => e.staff_member_id === staffId),
  });

  const createMutation = useMutation({
    mutationFn: () => db.TrainingRefresherLog.create({
      staff_member_id: staffId,
      date: form.date,
      topic: form.topic.trim(),
      delivered_by: form.delivered_by.trim() || undefined,
      staff_initials: form.staff_initials.trim() || undefined,
      notes: form.notes.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trainingRefresherLog', staffId] });
      setForm(BLANK_REFRESHER);
      setShowForm(false);
      toast.success('Refresher training logged');
    },
    onError: (e) => toast.error(e.message || 'Failed to log refresher training'),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Refresher / Ongoing Training</CardTitle>
            <CardDescription>Toolbox topics, refreshers, or updates following customer feedback</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)} className="gap-1"><Plus className="w-4 h-4" /> Log Entry</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs font-semibold">Date *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
              <div><Label className="text-xs font-semibold">Delivered by</Label><Input value={form.delivered_by} onChange={e => setForm(f => ({ ...f, delivered_by: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs font-semibold">Topic / Reason *</Label><Input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="e.g. RSA refresher, new POS system" className="mt-1" /></div>
              <div><Label className="text-xs font-semibold">Staff initials</Label><Input value={form.staff_initials} onChange={e => setForm(f => ({ ...f, staff_initials: e.target.value }))} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs font-semibold">Notes (optional)</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={!form.date || !form.topic.trim() || createMutation.isPending} className="flex-1">Save Entry</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No refresher training logged yet.</p>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Topic</TableHead><TableHead>Delivered By</TableHead><TableHead>Staff Initials</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {entries.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm whitespace-nowrap">{e.date}</TableCell>
                    <TableCell className="text-sm">{e.topic}</TableCell>
                    <TableCell className="text-sm">{e.delivered_by || '—'}</TableCell>
                    <TableCell className="text-sm">{e.staff_initials || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{e.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StaffTrainingDetail() {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  // "Assume the same trainer for the whole form" - one input per program,
  // carried into every item's signoff automatically as it's ticked, rather
  // than retyping the trainer's name on each of up to 27 rows.
  const [sessionTrainerByProgram, setSessionTrainerByProgram] = useState({});

  const { data: staffList = [] } = useQuery({ queryKey: ['staffMembers'], queryFn: () => db.StaffMember.list('full_name', 1000) });
  const staff = staffList.find(s => s.id === staffId);

  const { data: programs = [] } = useQuery({ queryKey: ['trainingPrograms'], queryFn: () => db.TrainingProgram.list('sort_order', 100) });
  const { data: items = [] } = useQuery({ queryKey: ['trainingItems'], queryFn: () => db.TrainingItem.list('sort_order', 1000) });
  const { data: signoffs = [] } = useQuery({
    queryKey: ['trainingSignoffsForStaff', staffId],
    queryFn: async () => (await db.TrainingSignoff.list('-updated_at', 5000)).filter(s => s.staff_member_id === staffId),
  });
  const signoffByItemId = useMemo(() => new Map(signoffs.map(s => [s.training_item_id, s])), [signoffs]);

  const upsertMutation = useMutation({
    mutationFn: ({ signoffId, payload }) => signoffId ? db.TrainingSignoff.update(signoffId, payload) : db.TrainingSignoff.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainingSignoffsForStaff', staffId] }),
    onError: (e) => toast.error(e.message || 'Failed to save'),
  });

  const updateStaffMutation = useMutation({
    mutationFn: (payload) => db.StaffMember.update(staffId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffMembers'] });
      setEditOpen(false);
      toast.success('Staff member updated');
    },
    onError: (e) => toast.error(e.message || 'Failed to update'),
  });

  const upsertFor = (item, signoff, partial) => {
    if (signoff?.id) {
      upsertMutation.mutate({ signoffId: signoff.id, payload: { ...partial, updated_at: new Date().toISOString() } });
    } else {
      upsertMutation.mutate({ signoffId: null, payload: { staff_member_id: staffId, training_item_id: item.id, ...partial, updated_at: new Date().toISOString() } });
    }
  };

  const openEdit = () => {
    setEditForm({
      full_name: staff.full_name, role: staff.role || '', employment_type: staff.employment_type || '',
      start_date: staff.start_date || '', primary_trainer: staff.primary_trainer || '', notes: staff.notes || '', active: staff.active,
    });
    setEditOpen(true);
  };

  if (!staff) {
    return (
      <div>
        <Button variant="ghost" onClick={() => navigate('/staff-training')} className="gap-2 mb-4"><ArrowLeft className="w-4 h-4" /> Back to Staff Training</Button>
        <Card className="p-8 text-center text-sm text-muted-foreground">Staff member not found.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/staff-training')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Staff Training
      </button>

      <PageHeader title={staff.full_name} subtitle={[staff.role, staff.employment_type && EMPLOYMENT_LABELS[staff.employment_type]].filter(Boolean).join(' · ') || 'Staff member'}>
        <Button variant="outline" onClick={openEdit} className="gap-2"><Pencil className="w-4 h-4" /> Edit</Button>
      </PageHeader>

      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Status</p><p>{staff.active ? <Badge className="bg-emerald-100 text-emerald-700 text-xs">Active</Badge> : <Badge variant="secondary" className="text-xs">Inactive</Badge>}</p></div>
          <div><p className="text-xs text-muted-foreground">Start date</p><p>{staff.start_date || '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Primary trainer</p><p>{staff.primary_trainer || '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Notes</p><p className="truncate">{staff.notes || '—'}</p></div>
        </div>
      </Card>

      {programs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No training programs set up yet.</Card>
      ) : programs.map(program => {
        const programItems = items.filter(i => i.program_id === program.id);
        const doneCount = programItems.filter(i => signoffByItemId.get(i.id)?.completed).length;
        const sections = [...new Set(programItems.map(i => i.section))];
        const pct = programItems.length ? Math.round((doneCount / programItems.length) * 100) : 0;
        const sessionTrainer = sessionTrainerByProgram[program.id] ?? staff.primary_trainer ?? '';

        return (
          <Card key={program.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2"><GraduationCap className="w-4 h-4" /> {program.name}</CardTitle>
                  {program.description && <CardDescription>{program.description}</CardDescription>}
                </div>
                <Badge className={`text-xs font-mono ${pct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{doneCount}/{programItems.length} signed off</Badge>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2 mb-3"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
              <div className="max-w-xs">
                <Label className="text-xs">Trainer for this form</Label>
                <Input
                  value={sessionTrainer}
                  onChange={e => setSessionTrainerByProgram(m => ({ ...m, [program.id]: e.target.value }))}
                  placeholder="Assumed the same for every item below"
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {sections.map(section => (
                <div key={section} className="space-y-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</h4>
                  <div className="space-y-0.5">
                    {programItems.filter(i => i.section === section).map(item => {
                      const signoff = signoffByItemId.get(item.id);
                      return (
                        <TrainingItemRow
                          key={`${item.id}-${signoff?.updated_at || 'new'}`}
                          item={item} signoff={signoff}
                          saving={upsertMutation.isPending}
                          onToggle={(checked) => upsertFor(item, signoff, {
                            completed: checked,
                            date_completed: checked && !signoff?.date_completed ? todayStr() : (signoff?.date_completed ?? null),
                            trainer: checked && !signoff?.trainer && sessionTrainer.trim() ? sessionTrainer.trim() : (signoff?.trainer ?? null),
                          })}
                          onFieldSave={(partial) => upsertFor(item, signoff, partial)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <RefresherLog staffId={staffId} />

      {editForm && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="font-display">Edit Staff Member</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Full name</Label>
                <Input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Role</Label>
                  <Input value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Employment type</Label>
                  <Select value={editForm.employment_type || 'unset'} onValueChange={v => setEditForm(f => ({ ...f, employment_type: v === 'unset' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">—</SelectItem>
                      {Object.entries(EMPLOYMENT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Start date</Label>
                  <Input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Primary trainer</Label>
                  <Input value={editForm.primary_trainer} onChange={e => setEditForm(f => ({ ...f, primary_trainer: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={editForm.active} onCheckedChange={(v) => setEditForm(f => ({ ...f, active: !!v }))} />
                <Label className="text-sm font-normal">Active</Label>
              </div>
              <Button
                className="w-full" disabled={!editForm.full_name.trim() || updateStaffMutation.isPending}
                onClick={() => updateStaffMutation.mutate({
                  full_name: editForm.full_name.trim(),
                  role: editForm.role.trim() || null,
                  employment_type: editForm.employment_type || null,
                  start_date: editForm.start_date || null,
                  primary_trainer: editForm.primary_trainer.trim() || null,
                  notes: editForm.notes.trim() || null,
                  active: editForm.active,
                })}
              >
                {updateStaffMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
