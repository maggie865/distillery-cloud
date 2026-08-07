import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingDown, ArrowDownToLine, ArrowUpFromLine, Building2, MapPin, Leaf, Calendar } from 'lucide-react';
import { format, startOfMonth, startOfYear, parseISO } from 'date-fns';
import StatCard from '@/components/shared/StatCard';

export default function CarbonReport({ receiving, dispatches, warehouseStock, startDate, endDate }) {
  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 100),
  });
  const distilleryAddress = appSettings.find(s => s.key === 'distillery_address')?.value || '250 Ocean Beach Road, Bluff, New Zealand';
  const warehouseAddress = appSettings.find(s => s.key === 'warehouse_address')?.value || '27 Pavillion Drive, Māngere, Auckland 2015, New Zealand';

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

  const monthLabel = `${format(rangeStart, 'dd MMM yyyy')} – ${format(rangeEnd, 'dd MMM yyyy')}`;

  // ── Month-filtered data ──
  const monthReceiving = receiving.filter(r => inRange(r.date_received));
  const monthDispatches = dispatches.filter(d => inRange(d.dispatch_date));
  const month3PLTransfers = warehouseStock.filter(w => inRange(w.transfer_date));

  // ── Month CO2e calculations ──
  const inboundCo2e = monthReceiving.reduce((s, r) => s + (r.co2e_kg || 0), 0);
  const dispatchCo2e = monthDispatches.reduce((s, d) => s + (d.co2e_kg || 0), 0);
  const monthAucklandTransfers = month3PLTransfers.filter(w => (w.warehouse_location || 'Auckland 3PL') === 'Auckland 3PL');
  const monthUKBondedTransfers = month3PLTransfers.filter(w => (w.warehouse_location || '') === 'UK Bonded');
  const aucklandTransferCo2e = monthAucklandTransfers.reduce((s, w) => s + (w.co2e_kg || 0), 0);
  const ukBondedTransferCo2e = monthUKBondedTransfers.reduce((s, w) => s + (w.co2e_kg || 0), 0);
  const transferCo2e = aucklandTransferCo2e + ukBondedTransferCo2e;
  const totalCo2e = inboundCo2e + dispatchCo2e + transferCo2e;
  const totalDistance = monthDispatches.reduce((s, d) => s + (d.transport_distance_km || 0), 0);

  // ── YTD calculations ──
  const now = new Date();
  const yearStart = startOfYear(now);
  const inYTD = (dateStr) => {
    if (!dateStr) return false;
    try {
      const d = parseISO(dateStr);
      return d >= yearStart && d <= now;
    } catch { return false; }
  };

  const ytdReceiving = receiving.filter(r => inYTD(r.date_received));
  const ytdDispatches = dispatches.filter(d => inYTD(d.dispatch_date));
  const ytd3PL = warehouseStock.filter(w => inYTD(w.transfer_date));
  const ytdUKBonded = ytd3PL.filter(w => (w.warehouse_location || '') === 'UK Bonded');

  const ytdInbound = ytdReceiving.reduce((s, r) => s + (r.co2e_kg || 0), 0);
  const ytdOutbound = ytdDispatches.reduce((s, d) => s + (d.co2e_kg || 0), 0);
  const ytd3PLCo2e = ytd3PL.reduce((s, w) => s + (w.co2e_kg || 0), 0);
  const ytdUKBondedCo2e = ytdUKBonded.reduce((s, w) => s + (w.co2e_kg || 0), 0);
  const ytdTotalCo2e = ytdInbound + ytdOutbound + ytd3PLCo2e;
  const ytdDistance = ytdDispatches.reduce((s, d) => s + (d.transport_distance_km || 0), 0);
  const ytdBottles = ytdDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0);
  const ytdAvgPerBottle = ytdBottles > 0 ? ytdTotalCo2e / ytdBottles : 0;

  // CO2e saved vs road-only baseline (for non-road dispatches)
  const ytdRoadBaseline = ytdDispatches.reduce((s, d) => {
    const weight = d.parcel_weight_kg || 0;
    const distance = d.transport_distance_km || 0;
    return s + (weight / 1000 / 56 * distance * 0.21);
  }, 0);
  const ytdSaved = ytdRoadBaseline - ytdOutbound;

  // ── Per-customer carbon summary ──
  const customerMap = {};
  monthDispatches.forEach(d => {
    const name = d.customer_name || 'Unknown';
    if (!customerMap[name]) {
      customerMap[name] = { customer: name, dispatches: 0, bottles: 0, distance: 0, co2e: 0 };
    }
    customerMap[name].dispatches++;
    customerMap[name].bottles += d.quantity_bottles || 0;
    customerMap[name].distance += d.transport_distance_km || 0;
    customerMap[name].co2e += d.co2e_kg || 0;
  });
  const customerCarbon = Object.values(customerMap)
    .map(c => ({ ...c, avgPerBottle: c.bottles > 0 ? c.co2e / c.bottles : 0 }))
    .sort((a, b) => b.co2e - a.co2e);

  // ── Transport method breakdown ──
  const transportMethods = ['road', 'courier', 'air', 'sea', 'pickup'];
  const combinedByMethod = transportMethods.map(method => ({
    method: method.charAt(0).toUpperCase() + method.slice(1),
    inbound: monthReceiving.filter(r => r.transport_method === method).reduce((s, r) => s + (r.co2e_kg || 0), 0),
    outbound: monthDispatches.filter(d => d.transport_method === method).reduce((s, d) => s + (d.co2e_kg || 0), 0),
  })).filter(d => d.inbound > 0 || d.outbound > 0);

  return (
    <>
      {/* YTD Summary */}
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Year to Date — Carbon Summary</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total CO2e YTD" value={ytdTotalCo2e.toFixed(1)} sub="kg (inbound + outbound + 3PL)" icon={Calendar} color="text-green-600" bg="bg-green-50 border-green-200" />
        <StatCard label="Distance YTD" value={ytdDistance.toLocaleString()} sub="km outbound" icon={MapPin} color="text-muted-foreground" bg="bg-card border-border" />
        <StatCard label="Avg CO2e / Bottle" value={ytdAvgPerBottle.toFixed(3)} sub="kg per bottle dispatched" icon={ArrowDownToLine} color="text-primary" bg="bg-accent border-accent-foreground/10" />
        <StatCard label="CO2e Saved vs Road" value={ytdSaved >= 0 ? `${ytdSaved.toFixed(1)} kg` : `+${Math.abs(ytdSaved).toFixed(1)} kg`} sub={ytdSaved >= 0 ? 'saved by non-road methods' : 'extra from non-road methods'} icon={Leaf} color={ytdSaved >= 0 ? 'text-emerald-600' : 'text-amber-600'} bg={ytdSaved >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} />
      </div>

      {/* Monthly Summary */}
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Transport Emissions</h3>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Total CO2e" value={totalCo2e.toFixed(1)} sub="kg all transport" icon={TrendingDown} color="text-green-600" bg="bg-green-50 border-green-200" />
        <StatCard label="Inbound CO2e" value={inboundCo2e.toFixed(1)} sub="kg from receiving" icon={ArrowDownToLine} color="text-amber-600" bg="bg-amber-50 border-amber-200" />
        <StatCard label="Outbound CO2e" value={dispatchCo2e.toFixed(1)} sub="kg to customers" icon={ArrowUpFromLine} color="text-primary" bg="bg-accent border-accent-foreground/10" />
        <StatCard label="3PL CO2e" value={aucklandTransferCo2e.toFixed(1)} sub="kg to Auckland 3PL" icon={Building2} color="text-blue-600" bg="bg-blue-50 border-blue-200" />
        <StatCard label="UK Bonded CO2e" value={ukBondedTransferCo2e.toFixed(1)} sub="kg overseas export" icon={MapPin} color="text-indigo-600" bg="bg-indigo-50 border-indigo-200" />
        <StatCard label="Total Distance" value={totalDistance.toLocaleString()} sub="km outbound" icon={MapPin} color="text-muted-foreground" bg="bg-card border-border" />
      </div>

      {/* Per-Customer Carbon Summary */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">Per-Customer Carbon Impact — {monthLabel}</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Dispatches</TableHead>
                <TableHead className="text-right">Bottles</TableHead>
                <TableHead className="text-right">Distance (km)</TableHead>
                <TableHead className="text-right">CO2e (kg)</TableHead>
                <TableHead className="text-right">Avg CO2e / Bottle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customerCarbon.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No dispatches this period</TableCell></TableRow>
              ) : customerCarbon.map(c => (
                <TableRow key={c.customer}>
                  <TableCell className="text-sm font-medium">{c.customer}</TableCell>
                  <TableCell className="text-sm text-right">{c.dispatches}</TableCell>
                  <TableCell className="text-sm text-right">{c.bottles.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-right">{c.distance.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-right font-semibold text-green-600">{c.co2e.toFixed(3)}</TableCell>
                  <TableCell className="text-sm text-right">{c.avgPerBottle.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Emissions by Transport Method */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">Emissions by Transport Method — {monthLabel}</h4>
        {combinedByMethod.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={combinedByMethod}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="method" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(val) => `${val.toFixed(3)} kg`} />
              <Legend />
              <Bar dataKey="inbound" name="Inbound (kg)" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outbound" name="Outbound (kg)" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No transport emission data available</p>
        )}
      </Card>

      {/* Inbound Receiving Emissions */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">Inbound Receiving Emissions — {monthLabel}</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>CO2e</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthReceiving.filter(r => r.co2e_kg > 0).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No inbound emissions recorded this month</TableCell></TableRow>
              ) : monthReceiving.filter(r => r.co2e_kg > 0).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date_received ? format(parseISO(r.date_received), 'dd MMM') : '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{r.material_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.supplier_name || '—'}</TableCell>
                  <TableCell className="text-sm capitalize">{r.transport_method || '—'}</TableCell>
                  <TableCell className="text-sm">{r.transport_distance_km ? `${r.transport_distance_km} km` : '—'}</TableCell>
                  <TableCell className="text-sm font-semibold text-amber-600">{r.co2e_kg.toFixed(3)} kg</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Customer Dispatch + 3PL Transfer Emissions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-4">Customer Dispatch Emissions — {monthLabel}</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>CO2e</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthDispatches.filter(d => !d.dispatched_from?.includes('Auckland')).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No dispatches</TableCell></TableRow>
                ) : monthDispatches.filter(d => !d.dispatched_from?.includes('Auckland')).map((d, i) => (
                  <TableRow key={d.id || i}>
                    <TableCell className="text-sm">{d.dispatch_date ? format(parseISO(d.dispatch_date), 'dd MMM') : '—'}</TableCell>
                    <TableCell className="text-sm">{d.customer_name}</TableCell>
                    <TableCell className="text-sm capitalize">{d.transport_method || '—'}</TableCell>
                    <TableCell className="text-sm font-semibold text-green-600">{d.co2e_kg ? `${d.co2e_kg.toFixed(3)} kg` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-4">Warehouse Transfer Emissions — {monthLabel}</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Bottles</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>CO2e</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {month3PLTransfers.filter(w => w.co2e_kg > 0).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No warehouse transfer emissions</TableCell></TableRow>
                ) : month3PLTransfers.filter(w => w.co2e_kg > 0).map(w => (
                  <TableRow key={w.id}>
                    <TableCell className="text-sm">{w.transfer_date ? format(parseISO(w.transfer_date), 'dd MMM') : '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{w.product_name}</TableCell>
                    <TableCell className="text-sm">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${(w.warehouse_location || '') === 'UK Bonded' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                        {w.warehouse_location || 'Auckland 3PL'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{w.quantity_bottles || '—'}</TableCell>
                    <TableCell className="text-sm">{w.transport_distance_km ? `${w.transport_distance_km} km` : '—'}</TableCell>
                    <TableCell className={`text-sm font-semibold ${(w.warehouse_location || '') === 'UK Bonded' ? 'text-indigo-600' : 'text-blue-600'}`}>{w.co2e_kg ? `${w.co2e_kg.toFixed(3)} kg` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}