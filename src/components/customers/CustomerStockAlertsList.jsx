import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ShoppingCart } from 'lucide-react';

// severity: red once stock has hit half of par or below, amber otherwise —
// gives the same "how bad is this" read at a glance the spec's 🔴/🟠
// example implies, without inventing a third data source for it.
function severity(currentStock, parLevel) {
  if (currentStock == null || !parLevel) return 'amber';
  return currentStock <= parLevel / 2 ? 'red' : 'amber';
}

/**
 * Below-par alerts. Reused on the Customer Profile (that customer's own
 * alerts, showCustomer=false) and the Sales Dashboard (every customer,
 * showCustomer=true) — same shape either way: [{ customer?, product,
 * currentStock, parLevel, suggestedOrderQty }].
 */
export default function CustomerStockAlertsList({ alerts, showCustomer = false, onQuickOrder, emptyText = 'No customers below their par level right now' }) {
  const navigate = useNavigate();

  if (alerts.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-destructive" /> Customer Stock Alerts</h2>
      <div className="space-y-2">
        {alerts.map((a, i) => {
          const dot = severity(a.currentStock, a.parLevel) === 'red' ? 'bg-destructive' : 'bg-warning';
          return (
            <div
              key={`${a.customer?.id || 'me'}-${a.product.id}-${i}`}
              className={`flex items-center justify-between gap-3 rounded-lg border border-border p-3 ${showCustomer ? 'cursor-pointer hover:bg-muted/40' : ''}`}
              onClick={showCustomer && a.customer ? () => navigate(`/customers/${a.customer.id}`) : undefined}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${dot}`} />
                <div className="min-w-0">
                  {showCustomer && a.customer && <p className="text-sm font-semibold truncate">{a.customer.business_name}</p>}
                  <p className="text-sm text-foreground">{a.product.name}{a.product.bottle_size_ml ? ` (${a.product.bottle_size_ml}ml)` : ''} — {a.currentStock} remaining</p>
                  <p className="text-xs text-muted-foreground">Target {a.parLevel} · Suggested order {a.suggestedOrderQty}</p>
                </div>
              </div>
              {onQuickOrder && (
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={(e) => { e.stopPropagation(); onQuickOrder(a); }}>
                  <ShoppingCart className="w-3.5 h-3.5" /> Quick Order
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
