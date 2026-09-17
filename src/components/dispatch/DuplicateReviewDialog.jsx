import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil, FileCheck, ClipboardList } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const fmtDate = (d) => { try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d || '—'; } };
const money = (v) => (typeof v === 'number' ? v.toFixed(3) : v ?? '—');

// One column of the side-by-side comparison — same field list rendered for
// both the new Xero import and the existing dispatch it might duplicate, so
// differences (or exact matches) are easy to scan at a glance.
function DispatchColumn({ title, icon: Icon, dispatch, accent }) {
  const rows = [
    ['Customer', dispatch.customer_name || '—'],
    ['Date', fmtDate(dispatch.dispatch_date)],
    ['Product', dispatch.product_name || '—'],
    ['Bottle size', dispatch.bottle_size_ml ? `${dispatch.bottle_size_ml}ml` : '—'],
    ['Quantity', `${dispatch.quantity_bottles ?? '—'} bottles`],
    ['LALs', money(dispatch.total_lals)],
    ['From', dispatch.dispatched_from || 'Bluff'],
    ['Status', dispatch.status || '—'],
    ['Duty free', dispatch.duty_free ? 'Yes' : 'No'],
    ['Export', dispatch.is_export ? 'Yes' : 'No'],
  ];
  return (
    <div className={`rounded-lg border p-3 ${accent}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-4 h-4" />
        <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      </div>
      <dl className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-xs gap-2">
            <dt className="text-muted-foreground shrink-0">{label}</dt>
            <dd className="font-medium text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Lets the person reviewing a "Possible Duplicate" badge actually see both
// records side by side before deciding — rather than having to open two
// separate Edit dialogs and cross-reference by memory.
export default function DuplicateReviewDialog({ review, onClose, onDeleteXero, onEditXero }) {
  if (!review) return null;
  const { xero, match } = review;

  return (
    <Dialog open={!!review} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Possible Duplicate</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          This Xero import matches an existing dispatch on customer, date, product, and bottle size. Compare them below and decide whether it's the same sale.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <DispatchColumn title="New from Xero" icon={FileCheck} dispatch={xero} accent="border-red-200 bg-red-50" />
          <DispatchColumn title="Existing dispatch" icon={ClipboardList} dispatch={match} accent="border-border bg-muted/30" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Button
            variant="destructive"
            className="flex-1 gap-1.5"
            onClick={() => onDeleteXero(xero)}
          >
            <Trash2 className="w-4 h-4" /> Same Sale — Delete Xero Import
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={() => onEditXero(xero)}
          >
            <Pencil className="w-4 h-4" /> Edit Xero Import
          </Button>
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Not a Duplicate — Keep Both
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
