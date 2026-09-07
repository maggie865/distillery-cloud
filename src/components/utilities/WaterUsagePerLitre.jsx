import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Droplets, Wine } from 'lucide-react';

// Water-use efficiency — litres of mains water per litre of finished gin
// bottled, over whatever period Utilities has selected. "Finished gin" is
// the bottled volume (bottles_produced × bottle_size_ml), not the
// pre-dilution spirit volume — that's what actually leaves the building,
// and it's the number an ISO 14001 water-intensity metric should track
// against. Every completed bottling run counts, since this is a
// single-spirit (gin) distillery — there's no product field reliable
// enough to filter on beyond that.
export default function WaterUsagePerLitre({ totalWaterLitres = 0, startDate = '', endDate = '' }) {
  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingFloorRuns'],
    queryFn: () => db.BottlingRun.list('-date', 5000),
  });

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  };
  const hasDateFilter = !!(startDate || endDate);

  const ginLitres = useMemo(() => {
    const completed = bottlingRuns.filter(r => r.status === 'completed' && (!hasDateFilter || inRange(r.date)));
    return completed.reduce((sum, r) => sum + ((r.bottles_produced || 0) * (r.bottle_size_ml || 0)) / 1000, 0);
  }, [bottlingRuns, startDate, endDate, hasDateFilter]);

  const ratio = ginLitres > 0 ? totalWaterLitres / ginLitres : null;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-1">
        <Droplets className="w-4 h-4" /> Water Use per Litre of Finished Gin
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Metered mains water logged above ÷ bottled gin volume from completed Bottling Floor runs, {hasDateFilter ? 'in this period' : 'all time'}.
      </p>

      {ginLitres === 0 ? (
        <p className="text-sm text-muted-foreground">No completed bottling runs {hasDateFilter ? 'in this period' : 'yet'} — nothing to compare water use against.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" /> Water per Litre of Gin</p>
            <p className="text-xl font-bold text-primary">{ratio.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">L water / L gin</span></p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" /> Total Water</p>
            <p className="text-xl font-bold text-foreground">{totalWaterLitres.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">L</span></p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Wine className="w-3 h-3" /> Finished Gin Bottled</p>
            <p className="text-xl font-bold text-foreground">{ginLitres.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-sm font-normal text-muted-foreground">L</span></p>
          </div>
        </div>
      )}
    </Card>
  );
}
