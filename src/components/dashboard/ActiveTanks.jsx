import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Cylinder, ChevronRight } from 'lucide-react';

export default function ActiveTanks() {
  const navigate = useNavigate();

  const { data: tanks = [], isLoading } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list('name', 5000),
  });

  const activeTanks = tanks
    .filter((t) => (t.current_volume || 0) > 0)
    .sort((a, b) => (b.current_volume || 0) / (b.capacity_litres || 1) - (a.current_volume || 0) / (a.capacity_litres || 1));

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">Active Tanks</h2>
        <button onClick={() => navigate('/tanks')} className="text-xs text-primary font-medium flex items-center gap-0.5 hover:underline">
          View all <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activeTanks.length === 0 ? (
        <div className="flex flex-col items-center text-center py-8 text-muted-foreground">
          <Cylinder className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No tanks currently hold product.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTanks.slice(0, 6).map((t) => {
            const pct = t.capacity_litres ? Math.min(100, Math.round(((t.current_volume || 0) / t.capacity_litres) * 100)) : 0;
            return (
              <button
                key={t.id}
                onClick={() => navigate('/tanks')}
                className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.current_product || 'Product'} {t.current_abv ? `· ${t.current_abv}%` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{pct}%</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
