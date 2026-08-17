import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StickyNote, Plus, Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export default function TankNotesTab({ tank, movements, userName, isAdmin }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const queryClient = useQueryClient();

  const notes = useMemo(
    () => [...movements]
      .filter((m) => m.action === 'note')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [movements]
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tankMovements'] });

  const addMutation = useMutation({
    mutationFn: () => db.TankMovement.create({
      date: new Date().toISOString().split('T')[0],
      action: 'note',
      tank_name: tank.name,
      volume_litres: 0,
      operator: userName || null,
      notes: draft.trim(),
    }),
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setDraft('');
      toast.success('Note added');
    },
    onError: (e) => toast.error('Failed to save: ' + e.message),
  });

  const editMutation = useMutation({
    mutationFn: (id) => db.TankMovement.update(id, { notes: editDraft.trim() }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast.success('Note updated');
    },
    onError: (e) => toast.error('Failed to save: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.TankMovement.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Note deleted');
    },
    onError: (e) => toast.error('Failed to delete: ' + e.message),
  });

  const canManage = (note) => isAdmin || (userName && note.operator === userName);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">Notes</h2>
        {!adding && (
          <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Add Note
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4 space-y-2 rounded-lg border border-border p-3">
          <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a note about this tank…" rows={3} />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(''); }}>Cancel</Button>
            <Button size="sm" disabled={!draft.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? 'Saving…' : 'Save Note'}
            </Button>
          </div>
        </div>
      )}

      {notes.length === 0 && !adding ? (
        <div className="text-center py-8 space-y-2">
          <StickyNote className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{n.operator || 'Unknown'}</span>
                  {' · '}
                  {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : n.date}
                </div>
                {canManage(n) && editingId !== n.id && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingId(n.id); setEditDraft(n.notes || ''); }} className="text-muted-foreground hover:text-foreground p-1">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm('Delete this note?')) deleteMutation.mutate(n.id); }} className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {editingId === n.id ? (
                <div className="space-y-2">
                  <Textarea autoFocus value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" disabled={!editDraft.trim() || editMutation.isPending} onClick={() => editMutation.mutate(n.id)}>
                      {editMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap">{n.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
