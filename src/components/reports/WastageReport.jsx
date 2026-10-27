import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingDown } from 'lucide-react';
import { format, startOfMonth, parseISO } from 'date-fns';
import StatCard from '@/components/shared/StatCard';
import Pagination from '@/components/ui/Pagination';

export default function WastageReport({ wastage, rawMaterials, startDate, endDate }) {
  const [wastePage, setWastePage] = useState(1);
  const [wastePageSize, setWastePageSize] = useState(50);

  const rangeStart = startDate ? parseISO(startDate) : startOfMonth(new Date());
  const rangeEnd = endDate ? parseISO(endDate) : new Date();
  const rangeEndInclusive = new Date(rangeEnd);
  rangeEndInclusive.setHours(23, 59, 59, 999);

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    try {
      const d = parseISO(dateStr);
      return d >= rangeStart && d <= rangeEndInclusive;
    } catch { return false; }
  };

  // Exclude tasting/sample bottle wastage records — these are intentional, not losses
  const monthWastage = wastage.filter(w =>
    inRange(w.date) &&
    !(w.reason || '').toLowerCase().includes('tasting') &&
    !(w.reason || '').toLowerCase().includes('sample bottle')
  );

  // Cost per LAL: look up cost from ethanol raw materials
  const ethanolCostPerLal = rawMaterials.filter(m => m.type === 'ethanol' && m.cost_per_unit)
    .reduce((avg, m, _, arr) => avg + m.cost_per_unit / arr.length, 0) || 3.5;

  const wastageWithCost = monthWastage.map(w => {
    const costPerLal = ethanolCostPerLal;
    const totalLoss = parseFloat(((w.lals || 0) * costPerLal).toFixed(2));
    return { ...w, cost_per_lal: costPerLal, total_loss: totalLoss };
  });

  const totalWastedLals = monthWastage.reduce((s, w) => s + (w.lals || 0), 0);
  const totalWastedVol = monthWastage.reduce((s, w) => s + (w.volume || 0), 0);
  const totalWastageCost = wastageWithCost.reduce((s, w) => s + w.total_loss, 0);
  const avgCostPerLalWasted = totalWastedLals > 0 ? (totalWastageCost / totalWastedLals).toFixed(2) : '0.00';

  // Wastage by source for bar chart
  const wastageBySource = ['distillation', 'bottling', 'tank', 'sns_distillation', 'other'].map(src => {
    const label = src === 'sns_distillation' ? 'SNS Distillation' : src.charAt(0).toUpperCase() + src.slice(1);
    return {
      source: label,
      lals: parseFloat(monthWastage.filter(w => w.source === src).reduce((s, w) => s + (w.lals || 0), 0).toFixed(3)),
      volume: parseFloat(monthWastage.filter(w => w.source === src).reduce((s, w) => s + (w.volume || 0), 0).toFixed(2)),
    };
  }).filter(d => d.lals > 0 || d.volume > 0);

  const monthLabel = `${format(rangeStart, 'dd MMM yyyy')} – ${format(rangeEnd, 'dd MMM yyyy')}`;
  const pagedWastage = wastageWithCost.slice((wastePage - 1) * wastePageSize, wastePage * wastePageSize);

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Wastage Analysis</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Volume Wasted" value={totalWastedVol.toFixed(2)} sub="litres" icon={TrendingDown} color="text-destructive" bg="bg-red-50 border-red-200" />
        <StatCard label="Total LALs Wasted" value={totalWastedLals.toFixed(3)} sub="litres abs. alcohol" icon={TrendingDown} color="text-destructive" bg="bg-red-50 border-red-200" />
        <StatCard label="Avg Cost / LAL" value={`$${avgCostPerLalWasted}`} sub="of wasted spirit" icon={TrendingDown} color="text-amber-700" bg="bg-amber-50 border-amber-200" />
        <StatCard label="Total Wastage Cost" value={`$${totalWastageCost.toFixed(2)}`} sub="estimated loss" icon={TrendingDown} color="text-amber-700" bg="bg-amber-50 border-amber-200" />
      </div>

      {wastageBySource.length > 0 && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-4">Wastage by Source — {monthLabel}</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={wastageBySource}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="source" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="volume" name="Volume (L)" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lals" name="LALs" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">Wastage Ledger — {monthLabel}</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Volume (L)</TableHead>
                <TableHead>ABV %</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Cost / LAL</TableHead>
                <TableHead>Total Loss</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wastageWithCost.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No wastage records this month</TableCell></TableRow>
              ) : pagedWastage.map(w => (
                <TableRow key={w.id}>
                  <TableCell className="text-sm">{w.date ? format(parseISO(w.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{w.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{w.batch_number}</TableCell>
                  <TableCell className="text-sm capitalize">{w.source}</TableCell>
                  <TableCell className="text-sm font-semibold">{w.volume?.toFixed(2) || '—'}</TableCell>
                  <TableCell className="text-sm">{w.abv ? `${w.abv}%` : '—'}</TableCell>
                  <TableCell className="text-sm">{w.lals?.toFixed(3) || '—'}</TableCell>
                  <TableCell className="text-sm text-amber-700">${w.cost_per_lal?.toFixed(2)}</TableCell>
                  <TableCell className="text-sm font-semibold text-destructive">${w.total_loss?.toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{w.reason || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination total={wastageWithCost.length} page={wastePage} pageSize={wastePageSize} onPageChange={setWastePage} onPageSizeChange={(s) => { setWastePageSize(s); setWastePage(1); }} />
      </Card>
    </div>
  );
}
