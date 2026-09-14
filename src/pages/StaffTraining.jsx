import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GraduationCap, Plus, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const EMPLOYMENT_LABELS = { permanent: 'Permanent', part_time: 'Part-time', casual: 'Casual' };

const BLANK_FORM = { full_name: '', role: '', employment_type: '', start_date: '', primary_trainer: '', notes: '' };

// Rounded percentage badge, coloured by how far along the program is - a
// quick "who can do what" read without opening each person's page.
function ProgressBadge({ done, total }) {
  if (total === 0) return null;
  const pct = Math.round((done / total) * 100);
  const cls = pct === 100 ? 'bg-emerald-100 text-emerald-700' : pct === 0 ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-700';
  return <Badge className={`text-xs font-mono ${cls}`}>{done}/{total}</Badge>;
}

export default function StaffTraining() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  const { data: staff = [], isLoading } = useQuery({ queryKey: ['staffMembers'], queryFn: () => db.StaffMember.list('full_name', 1000) });
  const { data: programs = [] } = useQuery({ queryKey: ['trainingPrograms'], queryFn: () => db.TrainingProgram.list('sort_order', 100) });
  const { data: items = [] } = useQuery({ queryKey: ['trainingItems'], queryFn: () => db.TrainingItem.list('sort_order', 1000) });
  const { data: signoffs = [] } = useQuery({ queryKey: ['trainingSignoffs'], queryFn: () => db.TrainingSignoff.list('-updated_at', 5000) });

  const itemsByProgram = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.program_id)) map.set(item.program_id, []);
      map.get(item.program_id).push(item);
    }
    return map;
  }, [items]);

  const completedItemIdsByStaff = useMemo(() => {
    const map = new Map();
    for (const s of signoffs) {
      if (!s.completed) continue;
      if (!map.has(s.staff_member_id)) map.set(s.staff_member_id, new Set());
      map.get(s.staff_member_id).add(s.training_item_id);
    }
    return map;
  }, [signoffs]);

  const createMutation = useMutation({
    mutationFn: () => db.StaffMember.create({
      full_name: form.full_name.trim(),
      role: form.role.trim() || undefined,
      employment_type: form.employment_type || undefined,
      start_date: form.start_date || undefined,
      primary_trainer: form.primary_trainer.trim() || undefined,
      notes: form.notes.trim() || undefined,
    }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['staffMembers'] });
      setShowForm(false);
      setForm(BLANK_FORM);
      toast.success('Staff member added');
      navigate(`/staff-training/${created.id}`);
    },
    onError: (e) => toast.error(e.message || 'Failed to add staff member'),
  });

  const visibleStaff = staff.filter(s => showInactive || s.active);
  const canSubmit = form.full_name.trim();

  return (
    <div>
      <PageHeader title="Staff Training" subtitle="Live sign-off tracking across all training programs — who can do what, at a glance">
        <Button onClick={() => { setForm(BLANK_FORM); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Add Staff Member
        </Button>
      </PageHeader>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">{programs.length} training program{programs.length === 1 ? '' : 's'} · {items.length} items tracked</p>
        <Button variant={showInactive ? 'default' : 'outline'} size="sm" onClick={() => setShowInactive(v => !v)}>
          {showInactive ? 'Hide inactive' : 'Show inactive'}
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : visibleStaff.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <GraduationCap className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No staff members yet.</p>
          <Button size="sm" onClick={() => setShowForm(true)}>Add the first one</Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleStaff.map(s => {
            const done = completedItemIdsByStaff.get(s.id) || new Set();
            return (
              <Card
                key={s.id}
                className={`p-4 flex items-center justify-between gap-3 cursor-pointer hover:border-primary/50 transition-colors ${!s.active ? 'opacity-60' : ''}`}
                onClick={() => navigate(`/staff-training/${s.id}`)}
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.full_name}{!s.active && <span className="text-xs text-muted-foreground ml-2">(Inactive)</span>}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[s.role, s.employment_type && EMPLOYMENT_LABELS[s.employment_type]].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {programs.map(p => {
                    const programItems = itemsByProgram.get(p.id) || [];
                    const doneCount = programItems.filter(i => done.has(i.id)).length;
                    return <ProgressBadge key={p.id} done={doneCount} total={programItems.length} />;
                  })}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Add Staff Member</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Full name</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Jamie Smith" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Role</Label>
                <Input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Bottling Operator" />
              </div>
              <div>
                <Label className="text-xs">Employment type</Label>
                <Select value={form.employment_type || 'unset'} onValueChange={v => setForm(f => ({ ...f, employment_type: v === 'unset' ? '' : v }))}>
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
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Primary trainer</Label>
                <Input value={form.primary_trainer} onChange={e => setForm(f => ({ ...f, primary_trainer: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button className="w-full" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Saving...' : 'Add Staff Member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
