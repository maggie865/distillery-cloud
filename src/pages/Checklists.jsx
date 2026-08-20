import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckSquare, Square, Plus, Trash2, ChevronDown, ChevronRight, ClipboardList, RotateCcw, GripVertical, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import PreUseChecksTab from '@/components/maintenance/PreUseChecksTab';

// ── Checklist templates stored as a single AppSettings JSON blob ──────────────
const TEMPLATES_KEY = 'checklist_templates';

function useTemplates() {
  const qc = useQueryClient();
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

  const saveTemplates = useMutation({
    mutationFn: async (newTemplates) => {
      const val = JSON.stringify(newTemplates);
      if (settingsRow) {
        await base44.entities.AppSettings.update(settingsRow.id, { value: val });
      } else {
        await base44.entities.AppSettings.create({ key: TEMPLATES_KEY, value: val });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist-templates'] }),
    onError: (e) => toast.error(e.message || 'Failed to save checklist'),
  });

  return { templates, saveTemplates: saveTemplates.mutateAsync, saving: saveTemplates.isPending };
}

// ── Checklist runs (completed sessions) ──────────────────────────────────────
function useRuns() {
  const qc = useQueryClient();
  const { data: settingsRow } = useQuery({
    queryKey: ['checklist-runs'],
    queryFn: async () => {
      const rows = await base44.entities.AppSettings.list('key', 5000);
      return rows.find(r => r.key === 'checklist_runs') || null;
    },
  });

  const runs = useMemo(() => {
    if (!settingsRow?.value) return [];
    try { return JSON.parse(settingsRow.value); } catch { return []; }
  }, [settingsRow]);

  const saveRuns = async (newRuns) => {
    const val = JSON.stringify(newRuns.slice(-200)); // keep last 200 runs
    if (settingsRow) {
      await base44.entities.AppSettings.update(settingsRow.id, { value: val });
    } else {
      await base44.entities.AppSettings.create({ key: 'checklist_runs', value: val });
    }
    qc.invalidateQueries({ queryKey: ['checklist-runs'] });
  };

  return { runs, saveRuns };
}

// ── Active Checklist Session ──────────────────────────────────────────────────
function ActiveChecklist({ template, onComplete, onClose }) {
  const [checked, setChecked] = useState({});
  const [completedBy, setCompletedBy] = useState('');
  const [notes, setNotes] = useState('');

  const totalItems = template.items.length;
  const doneCount = Object.values(checked).filter(Boolean).length;
  const allDone = doneCount === totalItems;

  const toggle = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${totalItems > 0 ? (doneCount / totalItems) * 100 : 0}%` }}
          />
        </div>
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{doneCount} / {totalItems}</span>
      </div>

      {/* Items */}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {template.items.map(item => (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
              checked[item.id]
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-background border-border hover:bg-muted/30'
            }`}
          >
            {checked[item.id]
              ? <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              : <Square className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            }
            <div className="flex-1">
              <p className={`text-sm font-medium ${checked[item.id] ? 'line-through text-emerald-700' : ''}`}>{item.text}</p>
              {item.note && <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Sign off */}
      <div>
        <Label className="text-xs font-semibold">Completed by</Label>
        <Input value={completedBy} onChange={e => setCompletedBy(e.target.value)} placeholder="Your name" className="mt-1" />
      </div>
      <div>
        <Label className="text-xs font-semibold">Notes (optional)</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any issues or observations..." className="mt-1" />
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!completedBy.trim()}
          onClick={() => onComplete({ checked, completedBy: completedBy.trim(), notes, allDone, doneCount, totalItems })}
        >
          {allDone ? '✅ Complete & Sign Off' : `Sign Off (${doneCount}/${totalItems} done)`}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Template Editor ───────────────────────────────────────────────────────────
function TemplateEditor({ template, onSave, onClose }) {
  const isNew = !template;
  const [name, setName] = useState(template?.name || '');
  const [category, setCategory] = useState(template?.category || 'daily');
  const [items, setItems] = useState(template?.items || []);
  const [newItem, setNewItem] = useState('');
  const [newNote, setNewNote] = useState('');

  const addItem = () => {
    if (!newItem.trim()) return;
    setItems(prev => [...prev, { id: Date.now().toString(), text: newItem.trim(), note: newNote.trim() || undefined }]);
    setNewItem('');
    setNewNote('');
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const moveItem = (id, dir) => {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const newItems = [...items];
    const swap = idx + dir;
    if (swap < 0 || swap >= newItems.length) return;
    [newItems[idx], newItems[swap]] = [newItems[swap], newItems[idx]];
    setItems(newItems);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold">Checklist Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Opening Checklist" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold">Category</Label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="odd-jobs">Odd Jobs</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No items yet — add some below</p>}
        {items.map((item, idx) => (
          <div key={item.id} className="flex items-start gap-2 p-2 border border-border rounded-lg bg-muted/20">
            <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.text}</p>
              {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => moveItem(item.id, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs px-1">↑</button>
              <button onClick={() => moveItem(item.id, 1)} disabled={idx === items.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs px-1">↓</button>
              <button onClick={() => removeItem(item.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border border-dashed border-border rounded-lg p-3">
        <p className="text-xs font-semibold text-muted-foreground">Add item</p>
        <Input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Task description" onKeyDown={e => e.key === 'Enter' && addItem()} />
        <Input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Optional note or instruction" className="text-sm" />
        <Button size="sm" onClick={addItem} disabled={!newItem.trim()} className="gap-1"><Plus className="w-3.5 h-3.5" /> Add Item</Button>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => onSave({ ...(template || {}), id: template?.id || Date.now().toString(), name, category, items })} disabled={!name.trim() || items.length === 0}>
          {isNew ? 'Create Checklist' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

const CATEGORY_LABELS = { daily: '📅 Daily', weekly: '📆 Weekly', monthly: '🗓 Monthly', 'odd-jobs': '🔧 Odd Jobs', other: '📋 Other' };
const CATEGORY_COLORS = { daily: 'bg-blue-100 text-blue-700', weekly: 'bg-purple-100 text-purple-700', monthly: 'bg-indigo-100 text-indigo-700', 'odd-jobs': 'bg-amber-100 text-amber-700', other: 'bg-muted text-muted-foreground' };

// ── Checklists tab (generic, user-defined task lists) ────────────────────────
function ChecklistsPanel() {
  const { templates, saveTemplates, saving } = useTemplates();
  const { runs, saveRuns } = useRuns();
  const [activeSession, setActiveSession] = useState(null); // { template }
  const [tab, setTab] = useState('run'); // 'run' | 'history'

  const grouped = useMemo(() => {
    const g = {};
    for (const t of templates) {
      const cat = t.category || 'other';
      if (!g[cat]) g[cat] = [];
      g[cat].push(t);
    }
    return g;
  }, [templates]);

  const handleSaveTemplate = async (tmpl) => {
    const existing = templates.find(t => t.id === tmpl.id);
    const newTemplates = existing
      ? templates.map(t => t.id === tmpl.id ? tmpl : t)
      : [...templates, tmpl];
    await saveTemplates(newTemplates);
    toast.success(existing ? 'Checklist updated' : 'Checklist created');
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Delete this checklist?')) return;
    await saveTemplates(templates.filter(t => t.id !== id));
    toast.success('Checklist deleted');
  };

  const handleComplete = async ({ checked, completedBy, notes, allDone, doneCount, totalItems }) => {
    const run = {
      id: Date.now().toString(),
      templateId: activeSession.template.id,
      templateName: activeSession.template.name,
      completedBy,
      notes,
      allDone,
      doneCount,
      totalItems,
      date: new Date().toISOString(),
      checked,
    };
    try {
      await saveRuns([...runs, run]);
      setActiveSession(null);
      toast.success(`${activeSession.template.name} signed off by ${completedBy}`);
    } catch (e) {
      toast.error(e.message || 'Failed to save checklist sign-off');
    }
  };

  const recentRuns = useMemo(() =>
    [...runs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50),
  [runs]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Team task lists and sign-off logs</p>
        <div className="flex gap-2">
          <Button variant={tab === 'run' ? 'default' : 'outline'} size="sm" onClick={() => setTab('run')}>
            <ClipboardList className="w-4 h-4 mr-1" /> Run
          </Button>
          <Button variant={tab === 'history' ? 'default' : 'outline'} size="sm" onClick={() => setTab('history')}>
            <RotateCcw className="w-4 h-4 mr-1" /> History
          </Button>
        </div>
      </div>

      {/* ── RUN TAB ── */}
      {tab === 'run' && (
        <div className="space-y-4">
          {templates.length === 0 ? (
            <Card className="p-10 text-center space-y-3">
              <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No checklists yet — an admin can create checklists in Settings</p>
            </Card>
          ) : (
            Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{CATEGORY_LABELS[cat] || cat}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(tmpl => {
                    const lastRun = recentRuns.find(r => r.templateId === tmpl.id);
                    return (
                      <Card key={tmpl.id} className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{tmpl.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{tmpl.items.length} item{tmpl.items.length !== 1 ? 's' : ''}</p>
                          </div>
                          <Badge className={`text-xs shrink-0 ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}>{CATEGORY_LABELS[cat] || cat}</Badge>
                        </div>
                        {lastRun && (
                          <p className="text-xs text-muted-foreground">
                            Last: {format(new Date(lastRun.date), 'd MMM, h:mma')} by {lastRun.completedBy}
                            {lastRun.allDone ? ' ✅' : ` (${lastRun.doneCount}/${lastRun.totalItems})`}
                          </p>
                        )}
                        <Button
                          size="sm"
                          className="mt-auto"
                          onClick={() => setActiveSession({ template: tmpl })}
                        >
                          Start Checklist
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="space-y-3">
          {recentRuns.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No completed checklists yet.</Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left p-3 font-semibold">Checklist</th>
                      <th className="text-left p-3 font-semibold">Date & Time</th>
                      <th className="text-left p-3 font-semibold">Completed by</th>
                      <th className="text-right p-3 font-semibold">Progress</th>
                      <th className="text-left p-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentRuns.map(run => (
                      <tr key={run.id} className={run.allDone ? 'bg-emerald-50/30' : 'bg-amber-50/30'}>
                        <td className="p-3 font-medium">{run.templateName}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{format(new Date(run.date), 'd MMM yyyy, h:mma')}</td>
                        <td className="p-3">{run.completedBy}</td>
                        <td className="p-3 text-right">
                          {run.allDone
                            ? <span className="text-emerald-600 font-medium">✅ All done</span>
                            : <span className="text-amber-600">{run.doneCount}/{run.totalItems}</span>
                          }
                        </td>
                        <td className="p-3 text-muted-foreground text-xs max-w-xs truncate">{run.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}


      {/* Active session dialog */}
      {activeSession && (
        <Dialog open={!!activeSession} onOpenChange={v => !v && setActiveSession(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-display">{activeSession.template.name}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1">
              <ActiveChecklist
                template={activeSession.template}
                onComplete={handleComplete}
                onClose={() => setActiveSession(null)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}


    </div>
  );
}

// ── Main Page — Checklists + the bottle washer's pre-use check share this
// page and one permission gate since they're both "things the team runs
// through before/during a shift", even though the data behind them is
// unrelated (user-defined templates vs. a fixed maintenance form) ──────────
export default function DailyChecks() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: records = [] } = useQuery({
    queryKey: ['maintenanceRecords'],
    queryFn: () => base44.entities.MaintenanceRecord.list('-date', 5000),
  });

  const createRecords = async (recordsList) => {
    setSaving(true);
    try {
      for (const data of recordsList) {
        await base44.entities.MaintenanceRecord.create(data);
      }
      await queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Daily Checks" subtitle="Team checklists and the bottle washer's pre-use check" />

      <Tabs defaultValue="checklists">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="checklists" className="gap-1.5"><ClipboardList className="w-4 h-4" /> Checklists</TabsTrigger>
          <TabsTrigger value="pre_use" className="gap-1.5"><Wrench className="w-4 h-4" /> Pre-Use Checks</TabsTrigger>
        </TabsList>
        <TabsContent value="checklists" className="mt-4">
          <ChecklistsPanel />
        </TabsContent>
        <TabsContent value="pre_use" className="mt-4">
          <PreUseChecksTab records={records} onCreate={createRecords} saving={saving} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
