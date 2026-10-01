import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db, supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Wine, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// Deliberately does NOT touch finished_good or pallet_item — this is a pure
// notification: record that a tasting bottle was opened, and email the
// owner, without adjusting any stock quantity anywhere.
export default function TastingBottleOpenedDialog({ pallet }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const { data: recent = [] } = useQuery({
    queryKey: ['tastingBottleOpened', pallet.id],
    queryFn: async () => {
      const all = await db.TastingBottleOpened.list('-created_at', 50);
      return all.filter(r => r.pallet_id === pallet.id).slice(0, 10);
    },
  });

  const reset = () => setNotes('');

  const mutation = useMutation({
    mutationFn: async () => {
      const openedByName = user?.full_name || user?.email || null;
      await db.TastingBottleOpened.create({
        pallet_id: pallet.id,
        pallet_code: pallet.pallet_code,
        location: pallet.location,
        opened_by_user_id: user?.id || null,
        opened_by_name: openedByName,
        notes: notes || null,
      });

      // Best-effort — the record above is the source of truth and must not
      // be undone just because the email failed to send.
      try {
        const { data, error } = await supabase.functions.invoke('notify-tasting-opened', {
          body: { palletCode: pallet.pallet_code, location: pallet.location, openedBy: openedByName, notes: notes || null },
        });
        if (error || !data?.success) return { emailSent: false };
      } catch {
        return { emailSent: false };
      }
      return { emailSent: true };
    },
    onSuccess: ({ emailSent }) => {
      qc.invalidateQueries({ queryKey: ['tastingBottleOpened', pallet.id] });
      toast.success('Recorded — no stock was changed');
      if (!emailSent) toast.warning("Couldn't send the email alert — the owner may not have been notified.");
      reset();
      setOpen(false);
    },
    onError: (e) => toast.error('Failed to record: ' + e.message),
  });

  return (
    <>
      <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Wine className="w-4 h-4" /> Tasting Bottle Opened
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); setOpen(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Bell className="w-4 h-4" /> Tasting Bottle Opened</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">This only sends an alert — it won't change any stock quantities.</p>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. which product" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'Sending…' : 'Send Alert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {recent.length > 0 && (
        <Card className="p-4 mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recent Tasting Opens</p>
          <div className="space-y-1.5">
            {recent.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {r.created_at ? format(new Date(r.created_at), 'd MMM, h:mm a') : '—'}
                  {r.opened_by_name ? ` · ${r.opened_by_name}` : ''}
                </span>
                {r.notes && <span className="text-xs text-muted-foreground truncate max-w-[50%]">{r.notes}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
