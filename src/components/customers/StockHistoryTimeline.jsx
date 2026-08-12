import { Card } from '@/components/ui/card';
import { History } from 'lucide-react';
import { format, parseISO } from 'date-fns';

// Visually modeled on CustomerActivityTimeline's timeline-dot pattern, so
// Stock History reads as part of the same profile rather than a bolted-on
// separate widget.
export default function StockHistoryTimeline({ history, products }) {
  const productName = (id) => products.find((p) => p.id === id)?.name || 'Unknown product';

  if (history.length === 0) {
    return (
      <Card className="p-10 text-center space-y-2">
        <History className="w-8 h-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No stock checks recorded yet — use "+ Stock Check" to log the first one.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-5">Stock History</h2>
      <div className="relative pl-2 space-y-6">
        <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
        {history.map((entry) => (
          <div key={entry.sessionId} className="relative pl-6">
            <div className="absolute -left-[7px] top-0.5 w-3.5 h-3.5 rounded-full bg-card border-2 border-primary" />
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-sm font-semibold text-foreground">{entry.checkDate ? format(parseISO(entry.checkDate), 'd MMM yyyy') : ''}</span>
              {entry.recordedBy && <span className="text-xs text-muted-foreground">Recorded by {entry.recordedBy}</span>}
            </div>
            <div className="space-y-0.5">
              {entry.lines.map((line) => (
                <p key={line.id} className="text-sm text-foreground">{productName(line.product_id)}: <span className="font-medium">{line.quantity_bottles}</span></p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
