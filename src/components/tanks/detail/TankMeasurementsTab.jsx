import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Ruler } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { calcLal } from '@/lib/tankMath';

export default function TankMeasurementsTab({ tank, movements, userName }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ volume_litres: '', abv: '', temperature_c: '', notes: '' });
  const queryClient = useQueryClient();

  const measurements = useMemo(
    () => [...movements]
      .filter((m) => (m.volume_litres || 0) > 0 || m.abv != null || m.temperature_c != null)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [movements]
  );

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const addMutation = useMutation({
    mutationFn: async () => {
      const volume = form.volume_litres ? parseFloat(form.volume_litres) : 0;
      const abv = form.abv ? parseFloat(form.abv) : null;
      await db.TankMovement.create({
        date: new Date().toISOString().split('T')[0],
        action: 'measurement',
        tank_name: tank.name,
        volume_litres: volume,
        abv,
        lals: calcLal(volume, abv),
        temperature_c: form.temperature_c ? parseFloat(form.temperature_c) : null,
        product: tank.current_product || null,
        batch_number: tank.current_batch || null,
        operator: userName || null,
        notes: form.notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      setOpen(false);
      setForm({ volume_litres: '', abv: '', temperature_c: '', notes: '' });
      toast.success('Measurement recorded');
    },
    onError: (e) => toast.error('Failed to save: ' + e.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.volume_litres && !form.abv && !form.temperature_c) {
      toast.error('Enter at least one reading');
      return;
    }
    addMutation.mutate();
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Measurements</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Measurement
        </Button>
      </div>

      {measurements.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <Ruler className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No measurements recorded yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>ABV</TableHead>
                <TableHead>Temperature</TableHead>
                <TableHead>LAL</TableHead>
                <TableHead>Recorded By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {measurements.map((m) => {
                const lal = m.lals ?? calcLal(m.volume_litres, m.abv);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm whitespace-nowrap">{m.date ? format(parseISO(m.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{m.created_at ? format(new Date(m.created_at), 'h:mma') : '—'}</TableCell>
                    <TableCell className="text-sm">{m.volume_litres ? `${m.volume_litres} L` : '—'}</TableCell>
                    <TableCell className="text-sm">{m.abv != null ? `${m.abv}%` : '—'}</TableCell>
                    <TableCell className="text-sm">{m.temperature_c != null ? `${m.temperature_c}°C` : '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{lal != null ? lal.toFixed(2) : '—'}</TableCell>
                    <TableCell className="text-sm">{m.operator || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Add Measurement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Volume (L)</Label>
                <Input type="number" step="0.1" value={form.volume_litres} onChange={(e) => set('volume_litres', e.target.value)} placeholder={String(tank.current_volume || 0)} />
              </div>
              <div>
                <Label>ABV %</Label>
                <Input type="number" step="0.1" value={form.abv} onChange={(e) => set('abv', e.target.value)} placeholder={tank.current_abv != null ? String(tank.current_abv) : ''} />
              </div>
              <div className="col-span-2">
                <Label>Temperature (°C)</Label>
                <Input type="number" step="0.1" value={form.temperature_c} onChange={(e) => set('temperature_c', e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" />
            </div>
            <Button type="submit" className="w-full" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Saving…' : 'Save Measurement'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
