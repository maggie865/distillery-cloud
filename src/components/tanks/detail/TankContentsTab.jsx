import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, PlayCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { calcLal } from '@/lib/tankMath';

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function TankContentsTab({ tank, filledAt, onStartProduction }) {
  const volume = tank.current_volume || 0;
  const abv = tank.current_abv;
  const lal = calcLal(volume, abv);

  if (volume <= 0) {
    return (
      <Card className="p-10 text-center space-y-3">
        <Package className="w-9 h-9 mx-auto text-muted-foreground/40" />
        <div>
          <p className="text-sm font-semibold text-foreground">Tank Empty</p>
          <p className="text-sm text-muted-foreground">No current batch · Ready for production</p>
        </div>
        {onStartProduction && (
          <Button size="sm" className="gap-2" onClick={onStartProduction}>
            <PlayCircle className="w-4 h-4" /> Start Production
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-3">Current Contents</h2>
      <div>
        <Row label="Product" value={tank.current_product || '—'} />
        <Row label="Batch" value={tank.current_batch || '—'} />
        <Row label="Volume" value={`${volume.toLocaleString()} L`} />
        <Row label="ABV" value={abv != null ? `${abv}%` : '—'} />
        <Row label="LAL" value={lal != null ? `${lal.toFixed(2)} LAL` : 'ABV not recorded'} />
        <Row label="Date added" value={filledAt ? format(parseISO(filledAt), 'd MMM yyyy') : '—'} />
      </div>
      {lal != null && (
        <div className="mt-4 rounded-lg bg-muted/40 px-4 py-3 text-sm text-center font-mono text-muted-foreground">
          {volume.toLocaleString()} L × {abv}% = <span className="font-semibold text-foreground">{lal.toFixed(2)} LAL</span>
        </div>
      )}
    </Card>
  );
}
