import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { generatePalletCode } from '@/lib/palletCode';
import { printPalletLabel } from '@/lib/palletLabel';

// Spins up an empty pallet ready to receive bottling output — no items yet,
// just a code and a label to print and stick on the physical pallet. Used
// by the Bottling Floor "choose a pallet" and "Complete Pallet" flows,
// where there's nothing to add to a manifest yet (nothing's bottled).
export default function QuickCreatePalletDialog({ open, onClose, onCreated, title = 'New Pallet', continueLabel = 'Start Bottling' }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [location, setLocation] = useState('Distillery');
  const [created, setCreated] = useState(null);

  const reset = () => { setLocation('Distillery'); setCreated(null); };

  const createMutation = useMutation({
    mutationFn: async () => {
      const pallet_code = await generatePalletCode();
      return base44.entities.Pallet.create({
        pallet_code,
        location,
        created_by_user_id: user?.id || null,
        created_by_name: user?.full_name || user?.email || null,
      });
    },
    onSuccess: (pallet) => {
      qc.invalidateQueries({ queryKey: ['pallets'] });
      setCreated(pallet);
    },
    onError: (e) => toast.error('Failed to create pallet: ' + e.message),
  });

  const handleClose = () => {
    if (created) onCreated?.(created);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">{title}</DialogTitle></DialogHeader>
        {created ? (
          <div className="space-y-4 mt-2 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <div>
              <p className="font-mono font-bold text-lg">{created.pallet_code}</p>
              <p className="text-sm text-muted-foreground">{created.location}</p>
            </div>
            <p className="text-sm text-muted-foreground">Print the label now and stick it on the pallet before bottling starts.</p>
            <Button variant="outline" className="w-full gap-1.5" onClick={() => printPalletLabel(created)}>
              <Printer className="w-4 h-4" /> Print Label
            </Button>
            <Button className="w-full" onClick={handleClose}>{continueLabel}</Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div>
              <Label>Location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Distillery">Distillery</SelectItem>
                  <SelectItem value="Auckland 3PL">Auckland 3PL</SelectItem>
                  <SelectItem value="UK Bonded">UK Bonded</SelectItem>
                  <SelectItem value="Shop">Shop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create Pallet'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
