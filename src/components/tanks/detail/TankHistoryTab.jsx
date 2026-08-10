import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { History } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ACTION_LABELS, ACTION_COLORS } from '@/components/tanks/detail/tankActionLabels';

export default function TankHistoryTab({ movements }) {
  const sorted = useMemo(
    () => [...movements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [movements]
  );

  if (sorted.length === 0) {
    return (
      <Card className="p-10 text-center space-y-2">
        <History className="w-8 h-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No history recorded yet</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-5">Tank History</h2>
      <div className="relative pl-6">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        <div className="space-y-6">
          {sorted.map((m) => {
            const details = [
              m.product && `Product: ${m.product}`,
              m.batch_number && `Batch: ${m.batch_number}`,
              (m.volume_litres || 0) > 0 && `Volume: ${m.volume_litres} L`,
              m.abv != null && `ABV: ${m.abv}%`,
              m.temperature_c != null && `Temp: ${m.temperature_c}°C`,
              m.counterpart_tank && `Tank ${m.counterpart_tank}`,
              m.notes,
            ].filter(Boolean);

            return (
              <div key={m.id} className="relative">
                <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full bg-card border-2 border-primary" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[m.action] || 'bg-muted text-muted-foreground'}`}>
                    {ACTION_LABELS[m.action] || m.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {m.date ? format(parseISO(m.date), 'd MMM yyyy') : ''}
                    {m.created_at && ` · ${format(new Date(m.created_at), 'h:mma')}`}
                  </span>
                  {m.operator && <span className="text-xs text-muted-foreground">· {m.operator}</span>}
                </div>
                {details.length > 0 && (
                  <p className="text-sm text-foreground mt-1">{details.join(' · ')}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
