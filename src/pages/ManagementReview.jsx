import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ClipboardCheck, Plus, Trash2, ChevronDown, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const todayStr = () => new Date().toISOString().split('T')[0];

const BLANK_FORM = {
  review_date: todayStr(), attendees: '', next_review_date: '',
  previous_actions_status: '', context_changes: '', performance_summary: '',
  legal_compliance_summary: '', objectives_summary: '', interested_party_feedback: '',
  resource_adequacy: '', improvement_opportunities: '', conclusion: '',
};

const blankActionItem = () => ({ _key: `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`, action: '', owner: '', due_date: '' });

function summarizeObjectives(objectives) {
  const s = { total: objectives.length, achieved: 0, in_progress: 0, missed: 0, on_hold: 0 };
  for (const o of objectives) s[o.status] = (s[o.status] || 0) + 1;
  return s;
}
function summarizeLegal(requirements) {
  const s = { total: requirements.length, compliant: 0, non_compliant: 0, under_review: 0, not_yet_assessed: 0 };
  for (const r of requirements) s[r.compliance_status] = (s[r.compliance_status] || 0) + 1;
  return s;
}

// ── Snapshot stat card — shown live when composing a new review (preview
// of what will be frozen into the record), and read back verbatim from
// the stored snapshot for past reviews ──────────────────────────────────
function SnapshotStats({ objectivesSnapshot, legalSnapshot, significantAspects }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-center">
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-lg font-bold">{objectivesSnapshot?.achieved ?? 0}/{objectivesSnapshot?.total ?? 0}</p>
        <p className="text-xs text-muted-foreground">Objectives achieved</p>
      </div>
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-lg font-bold">{legalSnapshot?.compliant ?? 0}/{legalSnapshot?.total ?? 0}</p>
        <p className="text-xs text-muted-foreground">Legal requirements compliant</p>
      </div>
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-lg font-bold">{significantAspects ?? 0}</p>
        <p className="text-xs text-muted-foreground">Significant aspects</p>
      </div>
    </div>
  );
}

function ReviewCard({ review }) {
  const [open, setOpen] = useState(false);
  const actionItems = Array.isArray(review.action_items) ? review.action_items : [];

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors text-left">
          <div>
            <p className="font-semibold text-sm">Review — {review.review_date}</p>
            {review.conclusion && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{review.conclusion}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {review.next_review_date && (
              <Badge variant="outline" className="text-xs gap-1"><CalendarClock className="w-3 h-3" /> Next: {review.next_review_date}</Badge>
            )}
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 border-t border-border pt-4">
            <SnapshotStats
              objectivesSnapshot={review.objectives_snapshot}
              legalSnapshot={review.legal_snapshot}
              significantAspects={review.significant_aspects_count}
            />
            {review.attendees && <div><p className="text-xs font-semibold text-muted-foreground">Attendees</p><p className="text-sm">{review.attendees}</p></div>}
            {[
              ['Status of previous actions', review.previous_actions_status],
              ['Changes in context', review.context_changes],
              ['Environmental performance', review.performance_summary],
              ['Legal compliance', review.legal_compliance_summary],
              ['Objectives progress', review.objectives_summary],
              ['Interested party feedback', review.interested_party_feedback],
              ['Resource adequacy', review.resource_adequacy],
              ['Improvement opportunities', review.improvement_opportunities],
              ['Conclusion', review.conclusion],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                <p className="text-sm whitespace-pre-wrap">{value}</p>
              </div>
            ))}
            {actionItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Action items</p>
                <div className="space-y-1">
                  {actionItems.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm rounded-lg bg-muted/30 px-3 py-1.5">
                      <span className="flex-1">{a.action}</span>
                      {a.owner && <span className="text-xs text-muted-foreground">{a.owner}</span>}
                      {a.due_date && <span className="text-xs text-muted-foreground">Due {a.due_date}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function ManagementReview() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [actionItems, setActionItems] = useState([]);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['managementReviews'],
    queryFn: () => db.ManagementReview.list('-review_date', 500),
  });

  const { data: objectives = [] } = useQuery({
    queryKey: ['environmentalObjectives'],
    queryFn: () => db.EnvironmentalObjective.list('-created_at', 5000),
  });
  const { data: legalRequirements = [] } = useQuery({
    queryKey: ['legalRequirements'],
    queryFn: () => db.LegalRequirement.list('-created_at', 5000),
  });
  const { data: aspects = [] } = useQuery({
    queryKey: ['environmentalAspects'],
    queryFn: () => db.EnvironmentalAspect.list('-created_at', 5000),
  });

  const liveObjectivesSnapshot = useMemo(() => summarizeObjectives(objectives), [objectives]);
  const liveLegalSnapshot = useMemo(() => summarizeLegal(legalRequirements), [legalRequirements]);
  const liveSignificantAspects = useMemo(() => aspects.filter(a => a.is_significant).length, [aspects]);

  const createMutation = useMutation({
    mutationFn: () => db.ManagementReview.create({
      review_date: form.review_date,
      attendees: form.attendees.trim() || undefined,
      next_review_date: form.next_review_date || undefined,
      previous_actions_status: form.previous_actions_status.trim() || undefined,
      context_changes: form.context_changes.trim() || undefined,
      performance_summary: form.performance_summary.trim() || undefined,
      legal_compliance_summary: form.legal_compliance_summary.trim() || undefined,
      objectives_summary: form.objectives_summary.trim() || undefined,
      interested_party_feedback: form.interested_party_feedback.trim() || undefined,
      resource_adequacy: form.resource_adequacy.trim() || undefined,
      improvement_opportunities: form.improvement_opportunities.trim() || undefined,
      conclusion: form.conclusion.trim() || undefined,
      action_items: actionItems.filter(a => a.action.trim()).map(({ _key, ...a }) => a),
      objectives_snapshot: liveObjectivesSnapshot,
      legal_snapshot: liveLegalSnapshot,
      significant_aspects_count: liveSignificantAspects,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['managementReviews'] });
      setFormOpen(false);
      setForm(BLANK_FORM);
      setActionItems([]);
      toast.success('Management review recorded');
    },
    onError: (e) => toast.error(e.message || 'Failed to save review'),
  });

  const setActionItem = (key, field, value) => setActionItems(prev => prev.map(a => a._key === key ? { ...a, [field]: value } : a));

  return (
    <div className="space-y-6">
      <PageHeader title="Management Review" subtitle="Periodic sign-off that the EMS remains suitable, adequate, and effective">
        <Button className="gap-1.5" onClick={() => { setForm({ ...BLANK_FORM, review_date: todayStr() }); setActionItems([]); setFormOpen(true); }}>
          <Plus className="w-4 h-4" /> New Review
        </Button>
      </PageHeader>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : reviews.length === 0 ? (
        <Card className="p-10 text-center space-y-3">
          <ClipboardCheck className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No management reviews recorded yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">New Management Review</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Review date</Label>
                <Input type="date" value={form.review_date} onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Attendees</Label>
                <Input value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} placeholder="Names / roles" />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Current EMS status (frozen into this review)</p>
              <SnapshotStats objectivesSnapshot={liveObjectivesSnapshot} legalSnapshot={liveLegalSnapshot} significantAspects={liveSignificantAspects} />
            </div>

            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inputs</p>
              <div>
                <Label className="text-xs">Status of actions from previous review</Label>
                <Textarea rows={2} value={form.previous_actions_status} onChange={e => setForm(f => ({ ...f, previous_actions_status: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Changes in internal/external context</Label>
                <Textarea rows={2} value={form.context_changes} onChange={e => setForm(f => ({ ...f, context_changes: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Environmental performance summary</Label>
                <Textarea rows={2} value={form.performance_summary} onChange={e => setForm(f => ({ ...f, performance_summary: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Legal compliance summary</Label>
                <Textarea rows={2} value={form.legal_compliance_summary} onChange={e => setForm(f => ({ ...f, legal_compliance_summary: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Objectives progress summary</Label>
                <Textarea rows={2} value={form.objectives_summary} onChange={e => setForm(f => ({ ...f, objectives_summary: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Interested party feedback / complaints</Label>
                <Textarea rows={2} value={form.interested_party_feedback} onChange={e => setForm(f => ({ ...f, interested_party_feedback: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Adequacy of resources</Label>
                <Textarea rows={2} value={form.resource_adequacy} onChange={e => setForm(f => ({ ...f, resource_adequacy: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outputs</p>
              <div>
                <Label className="text-xs">Opportunities for continual improvement</Label>
                <Textarea rows={2} value={form.improvement_opportunities} onChange={e => setForm(f => ({ ...f, improvement_opportunities: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Conclusion (suitability, adequacy, effectiveness)</Label>
                <Textarea rows={3} value={form.conclusion} onChange={e => setForm(f => ({ ...f, conclusion: e.target.value }))} />
              </div>

              <div>
                <Label className="text-xs">Action items</Label>
                <div className="space-y-2 mt-1.5">
                  {actionItems.map(a => (
                    <div key={a._key} className="flex gap-2 items-start">
                      <Input className="flex-1" placeholder="Action" value={a.action} onChange={e => setActionItem(a._key, 'action', e.target.value)} />
                      <Input className="w-32" placeholder="Owner" value={a.owner} onChange={e => setActionItem(a._key, 'owner', e.target.value)} />
                      <Input className="w-36" type="date" value={a.due_date} onChange={e => setActionItem(a._key, 'due_date', e.target.value)} />
                      <button type="button" onClick={() => setActionItems(prev => prev.filter(x => x._key !== a._key))} className="text-muted-foreground hover:text-destructive transition-colors mt-2">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setActionItems(prev => [...prev, blankActionItem()])}>
                    <Plus className="w-3.5 h-3.5" /> Add action item
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs">Next review date</Label>
                <Input type="date" value={form.next_review_date} onChange={e => setForm(f => ({ ...f, next_review_date: e.target.value }))} />
              </div>
            </div>

            <Button className="w-full" disabled={!form.review_date || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Saving...' : 'Save Review'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
