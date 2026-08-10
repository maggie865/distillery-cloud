import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ClipboardList, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

const TEMPLATES_KEY = 'checklist_templates';
const CATEGORY_LABELS = { daily: '📅 Daily', weekly: '📆 Weekly', monthly: '🗓 Monthly', 'odd-jobs': '🔧 Odd Jobs', other: '📋 Other' };

export default function ChecklistManager() {
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
