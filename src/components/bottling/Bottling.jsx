import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';

export default function Bottling() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    batch_number: '', date: new Date().toISOString().split('T')[0],
    product_name: '', input_volume: '', input_abv: '',
    bottle_size_ml: '700', bottles_produced: '',
    status: 'completed', notes: ''
  });
  const queryClient = useQueryClient();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => db.BottlingRun.list('-date', 50),
  });

  const inputLALs = form.input_volume && form.input_abv
    ? parseFloat(form.input_volume) * parseFloat(form.input_abv) / 100 : 0;
  const estimatedBottles = form.input_volume && form.bottle_size_ml
    ? Math.floor((parseFloat(form.input_volume) * 1000) / parseFloat(form.bottle_size_ml)) : 0;
  const bottlesForCalc = parseInt(form.bottles_produced) || estimatedBottles;
  const lalsPerBottle = bottlesForCalc > 0 && inputLALs > 0
    ? inputLALs / bottlesForCalc : 0;

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const bottlesProduced = parseInt(data.bottles_produced) || estimatedBottles;
      const lalPerBottle = bottlesProduced > 0
        ? (parseFloat(data.bottle_size_ml) / 1000) * (parseFloat(data.input_abv) / 100)
        : 0;
      const totalLals = lalPerBottle * bottlesProduced;

      const lalsPerBottleCalc = bottlesProduced > 0 && inputLALs > 0 ? inputLALs / bottlesProduced : 0;
      await db.BottlingRun.create({
        ...data,
        input_volume: parseFloat(data.input_volume) || 0,
        input_abv: parseFloat(data.input_abv) || 0,
        input_lals: parseFloat(inputLALs.toFixed(4)),
        bottle_size_ml: parseFloat(data.bottle_size_ml),
        bottles_produced: bottlesProduced,
        lals_per_bottle: parseFloat(lalsPerBottleCalc.toFixed(5)),
      });

      // Create/update finished goods
      if (data.status === 'completed' && bottlesProduced > 0) {
        const existing = await db.FinishedGood.filter({
          product_name: data.product_name,
          batch_number: data.batch_number,
        });
        if (existing.length > 0) {
          const fg = existing[0];
          await db.FinishedGood.update(fg.id, {
            quantity_bottles: (fg.quantity_bottles || 0) + bottlesProduced,
            total_lals: (fg.total_lals || 0) + totalLals,
          });
        } else {
          await db.FinishedGood.create({
            product_name: data.product_name,
            batch_number: data.batch_number,
            bottle_size_ml: parseFloat(data.bottle_size_ml),
            abv_percent: parseFloat(data.input_abv),
            quantity_bottles: bottlesProduced,
            total_lals: parseFloat(totalLals.toFixed(4)),
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingRuns'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setOpen(false);
      setForm({
        batch_number: '', date: new Date().toISOString().split('T')[0],
        product_name: '', input_volume: '', input_abv: '',
        bottle_size_ml: '700', bottles_produced: '',
        status: 'completed', notes: ''
      });
      toast.success('Bottling run recorded');
    },
    onError: (err) => toast.error(err.message || 'Failed to save bottling run'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div>
      <PageHeader title="Bottling" subtitle="Bottle your spirits into finished goods">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New Bottling</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Record Bottling Run</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Batch Number</Label>
                  <Input value={form.batch_number} onChange={e => set('batch_number', e.target.value)} required />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
                </div>
                <div className="col-span-2">
                  <Label>Product Name</Label>
                  <Input value={form.product_name} onChange={e => set('product_name', e.target.value)} required />
                </div>
                <div>
                  <Label>Spirit Volume (L)</Label>
                  <Input type="number" step="0.01" value={form.input_volume} onChange={e => set('input_volume', e.target.value)} />
                </div>
                <div>
                  <Label>ABV %</Label>
                  <Input type="number" step="0.1" value={form.input_abv} onChange={e => set('input_abv', e.target.value)} />
                </div>
                <div>
                  <Label>Bottle Size (ml)</Label>
                  <Select value={form.bottle_size_ml} onValueChange={v => set('bottle_size_ml', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="200">200ml</SelectItem>
                      <SelectItem value="350">350ml</SelectItem>
                      <SelectItem value="500">500ml</SelectItem>
                      <SelectItem value="700">700ml</SelectItem>
                      <SelectItem value="750">750ml</SelectItem>
                      <SelectItem value="1000">1000ml</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bottles Produced</Label>
                  <Input type="number" value={form.bottles_produced} onChange={e => set('bottles_produced', e.target.value)}
                    placeholder={estimatedBottles > 0 ? `Est: ${estimatedBottles}` : ''} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => set('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {inputLALs > 0 && (
                <Card className="bg-accent/50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-accent-foreground/70 mb-2">Summary</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Input LALs</p>
                      <p className="font-semibold">{inputLALs.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Est. Bottles</p>
                      <p className="font-semibold">{estimatedBottles}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Bottle Size</p>
                      <p className="font-semibold">{form.bottle_size_ml}ml</p>
                    </div>
                    {lalsPerBottle > 0 && (
                      <div>
                        <p className="text-muted-foreground text-xs">LALs / Bottle</p>
                        <p className="font-semibold text-primary">{lalsPerBottle.toFixed(4)}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Record Bottling'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Volume (L)</TableHead>
                <TableHead>ABV</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>LALs/Bottle</TableHead>
                <TableHead>Bottle Size</TableHead>
                <TableHead>Bottles</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : runs.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No bottling runs</TableCell></TableRow>
              ) : runs.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{r.batch_number}</TableCell>
                  <TableCell className="text-sm">{r.product_name}</TableCell>
                  <TableCell className="text-sm">{r.input_volume}</TableCell>
                  <TableCell className="text-sm">{r.input_abv ? `${r.input_abv}%` : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.input_lals?.toFixed(3)}</TableCell>
                  <TableCell className="text-sm font-medium text-primary">{r.lals_per_bottle ? r.lals_per_bottle.toFixed(4) : '—'}</TableCell>
                  <TableCell className="text-sm">{r.bottle_size_ml}ml</TableCell>
                  <TableCell className="text-sm font-medium">{r.bottles_produced}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}