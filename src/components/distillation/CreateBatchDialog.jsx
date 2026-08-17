import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const BLANK = {
  batch_code: '',
  product_name: '',
  date_started: new Date().toISOString().split('T')[0],
};

export default function CreateBatchDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(BLANK);
  const queryClient = useQueryClient();

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      return db.MasterBatch.create({
        batch_code: form.batch_code.toUpperCase(),
        product_name: form.product_name,
        date_started: form.date_started,
        status: 'in_progress',
      });
    },
    onSuccess: (master) => {
      queryClient.invalidateQueries({ queryKey: ['masterBatches'] });
      toast.success(`Batch ${master.batch_code} created`);
      onCreated?.(master);
      onOpenChange(false);
      setForm(BLANK);
    },
    onError: (err) => toast.error(err.message || 'Failed to create batch'),
  });

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setForm(BLANK); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Create New Batch</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={e => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-4 mt-2"
        >
          <div>
            <Label>Batch Code</Label>
            <Input
              value={form.batch_code}
              onChange={e => set('batch_code', e.target.value)}
              placeholder="e.g. GIN-001"
              required
            />
          </div>
          <div>
            <Label>Product Name</Label>
            <Input
              value={form.product_name}
              onChange={e => set('product_name', e.target.value)}
              placeholder="e.g. London Dry Gin"
              required
            />
          </div>
          <div>
            <Label>Start Date</Label>
            <Input
              type="date"
              value={form.date_started}
              onChange={e => set('date_started', e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            All other batch details (runs, volumes, LALs) will be populated automatically as you add distillation records.
          </p>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Batch'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
