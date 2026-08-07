import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Zap, Droplets, Truck, Building2, Leaf, Factory } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ELECTRICITY_EF, WATER_EF } from '@/pages/UtilityTracker';
import StatCard from '@/components/shared/StatCard';

/**
 * ISO 14001 lifecycle-style environmental report.
 * Combines operational utilities (Scope 2 electricity + town water) with logistics
 * emissions (inbound receiving, outbound dispatches, 3PL warehouse transfers) to give
 * a consolidated carbon footprint for the selected period.
 */
export default function IsoLifecycleReport({ receiving = [], dispatches = [], warehouseStock = [], startDate, endDate }) {
  const { data: utilityLogs = [] } = useQuery({
    queryKey: ['utilityLogs'],
    queryFn: () => base44.entities.UtilityLog.list('-reading_date', 5000),
  });

  const rangeStart = startDate ? parseISO(startDate) : startOfMonth(new Date());
  const rangeEnd = endDate ? parseISO(endDate) : new Date();
  const rangeEndInclusive = new Date(rangeEnd);
  rangeEndInclusive.setHours(23, 59, 59, 999);

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    try { return isWithinInterval(parseISO(dateStr), { start: rangeStart, end: rangeEndInclusive }); }
    catch { return false; }
  };

  const periodLogs = utilityLogs.filter(l => inRange(l.reading_date));

  // Scope 2 — grid electricity
  const totalKwh = periodLogs.reduce((s, l) => s + (l.electricity_kwh || 0), 0);
  const elecCo2e = totalKwh * ELECTRICITY_EF;

  // Town water supply
  const totalWaterL = periodLogs.reduce((s, l) => s + (l.water_litres || 0), 0);
  const waterCo2e = (totalWaterL / 1000) * WATER_EF;

  // Logistics emissions (from existing carbon data)
  const monthReceiving = receiving.filter(r => inRange(r.date_received));
  const monthDispatches = dispatches.filter(d => inRange(d.dispatch_date));
  const monthTransfers = warehouseStock.filter(w => inRange(w.transfer_date || w.date_transferred_in));
  const inboundCo2e = monthReceiving.reduce((s, r) => s + (r.co2e_kg || 0), 0);
  const outboundCo2e = monthDispatches.reduce((s, d) => s + (d.co2e_kg || 0), 0);
  const transferCo2e = monthTransfers.reduce((s, w) => s + (w.co2e_kg || 0), 0);
  const logisticsCo2e = inboundCo2e + outboundCo2e + transferCo2e;

  const totalCo2e = elecCo2e + waterCo2e + logisticsCo2e;

  // Per-period breakdown for chart
  const byPeriod = useMemo(() => {
    const map = {};
    for (const l of periodLogs) {
      const key = l.period || (l.reading_date ? format(parseISO(l.reading_date), 'MMM yy') : '—');
      if (!map[key]) map[key] = { period: key, electricity: 0, water: 0 };
      map[key].electricity += (l.electricity_kwh || 0) * ELECTRICITY_EF;
      map[key].water += ((l.water_litres || 0) / 1000) * WATER_EF;
    }
    return Object.values(map).sort((a, b) => a.period.localeCompare(b.period));
  }, [periodLogs]);

  const periodLabel = `${format(rangeStart, 'dd MMM yyyy')} – ${format(rangeEnd, 'dd MMM yyyy')}`;

  const breakdownRows = [
    { scope: 'Scope 2', source: 'Grid electricity (mains)', factor: `${ELECTRICITY_EF} kg/kWh`, qty: `${totalKwh.toLocaleString()} kWh`, co2e: elecCo2e, icon: Zap },
    { scope: 'Scope 3', source: 'Town water supply', factor: `${WATER_EF} kg/m³`, qty: `${(totalWaterL / 1000).toFixed(1)} m³`, co2e: waterCo2e, icon: Droplets },
    { scope: 'Scope 3', source: 'Inbound freight (receiving)', factor: 'per shipment', qty: `${monthReceiving.length} receipts`, co2e: inboundCo2e, icon: Truck },
    { scope: 'Scope 3', source: 'Outbound dispatches', factor: 'per shipment', qty: `${monthDispatches.length} dispatches`, co2e: outboundCo2e, icon: Truck },
    { scope: 'Scope 3', source: '3PL warehouse transfers', factor: 'per transfer', qty: `${monthTransfers.length} transfers`, co2e: transferCo2e, icon: Building2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">ISO Lifecycle Report — {periodLabel}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Consolidated operational carbon footprint: mains electricity (Scope 2), town water supply, and logistics (Scope 3).
          Emission factors: electricity {ELECTRICITY_EF} kg CO₂e/kWh · water {WATER_EF} kg CO₂e/m³.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Electricity CO₂e" value={`${elecCo2e.toFixed(1)} kg`} sub={`${totalKwh.toLocaleString()} kWh`} icon={Zap} color="text-amber-600" bg="bg-amber-50 border-amber-200" />
        <StatCard label="Water CO₂e" value={`${waterCo2e.toFixed(1)} kg`} sub={`${(totalWaterL / 1000).toFixed(1)} m³`} icon={Droplets} color="text-sky-600" bg="bg-sky-50 border-sky-200" />
        <StatCard label="Logistics CO₂e" value={`${logisticsCo2e.toFixed(1)} kg`} sub="inbound + outbound + 3PL" icon={Truck} color="text-indigo-600" bg="bg-indigo-50 border-indigo-200" />
        <StatCard label="Total CO₂e" value={`${totalCo2e.toFixed(1)} kg`} sub={`${(totalCo2e / 1000).toFixed(2)} tonnes`} icon={Factory} color="text-primary" bg="bg-primary/10 border-primary/20" />
      </div>

      {byPeriod.length > 0 && (
        <Card><CardContent className="p-4">
          <h4 className="text-sm font-semibold mb-4">Utility Emissions by Period</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byPeriod}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit=" kg" />
              <Tooltip unit=" kg CO₂e" />
              <Legend />
              <Bar dataKey="electricity" name="Electricity (kg CO₂e)" stackId="a" fill="#d97706" radius={[0, 0, 0, 0]} />
              <Bar dataKey="water" name="Water (kg CO₂e)" stackId="a" fill="#0284c7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><Leaf className="w-4 h-4 text-primary" /> Lifecycle Emissions Breakdown</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Factor</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">CO₂e (kg)</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdownRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs font-semibold">{r.scope}</TableCell>
                  <TableCell className="text-sm font-medium">{r.source}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.factor}</TableCell>
                  <TableCell className="text-right text-sm">{r.qty}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{r.co2e.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{totalCo2e > 0 ? `${((r.co2e / totalCo2e) * 100).toFixed(1)}%` : '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell colSpan={4} className="font-bold">Total</TableCell>
                <TableCell className="text-right font-bold text-primary">{totalCo2e.toFixed(2)}</TableCell>
                <TableCell className="text-right text-xs">100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      {periodLogs.length > 0 && (
        <Card><CardContent className="p-4">
          <h4 className="text-sm font-semibold mb-4">Utility Readings — {periodLabel}</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Reading Date</TableHead>
                  <TableHead className="text-right">Electricity (kWh)</TableHead>
                  <TableHead className="text-right">Water (L)</TableHead>
                  <TableHead className="text-right">CO₂e (kg)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodLogs.map(l => {
                  const co2e = (l.electricity_kwh || 0) * ELECTRICITY_EF + ((l.water_litres || 0) / 1000) * WATER_EF;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-sm">{l.period}</TableCell>
                      <TableCell className="text-sm">{l.reading_date ? format(parseISO(l.reading_date), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-right">{(l.electricity_kwh || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(l.water_litres || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{co2e.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}