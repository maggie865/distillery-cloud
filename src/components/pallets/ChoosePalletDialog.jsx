import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScanLine, Plus, Package } from 'lucide-react';

// Gates the start of a bottling run — staff must attach their output to a
// physical pallet, either one already on the floor (scan its label, which
// now includes pallets marked "emptied" after everything on them was
// dispatched off) or a freshly printed one. Also reused mid-run once the
// current pallet is marked full, so staff can swap onto another pallet
// that's been emptied instead of only ever starting a brand new one.
export default function ChoosePalletDialog({
  open, onClose, onChooseExisting, onChooseNew,
  description = "Before bottling starts, attach this run's output to a pallet.",
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Package className="w-5 h-5" /> Which Pallet?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <p className="text-sm text-muted-foreground">{description}</p>
          <Button className="w-full h-14 text-base gap-2 justify-start" variant="outline" onClick={onChooseExisting}>
            <ScanLine className="w-5 h-5" />
            <div className="text-left">
              <p className="font-semibold">Scan an Existing Pallet</p>
              <p className="text-xs text-muted-foreground font-normal">Stack onto a pallet already on the floor — including one that's been emptied</p>
            </div>
          </Button>
          <Button className="w-full h-14 text-base gap-2 justify-start" variant="outline" onClick={onChooseNew}>
            <Plus className="w-5 h-5" />
            <div className="text-left">
              <p className="font-semibold">Start a New Pallet</p>
              <p className="text-xs text-muted-foreground font-normal">Create one and print its label</p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
