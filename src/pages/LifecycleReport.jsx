import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { db } from '@/api/supabaseClient';
import { ELECTRICITY_EF, WATER_EF } from '@/pages/UtilityTracker';
import { DEFAULT_EMISSION_FACTORS, EMISSION_FACTORS_KEY, co2eFor, normalizeWasteRecord } from '@/pages/WasteTracker';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Factory, Boxes, Truck, Trash2, Info } from 'lucide-react';
import { startOfYear } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';

// Same 5 lifecycle stages as AspectsRegister.jsx's LIFECYCLE_STAGES — kept
// as a separate local copy since this page pairs each stage with its own
// icon/CO2e source, which AspectsRegister has no use for.
const STAGES = [
  { id: 'raw_materials', label: 'Raw Materials', icon: Package },
  { id: 'production', label: 'Production', icon: Factory },
  { id: 'packaging', label: 'Packaging', icon: Boxes },
  { id: 'distribution', label: 'Distribution', icon: Truck },
  { id: 'disposal', label: 'Disposal', icon: Trash2 },
];

const todayStr = () => new Date().toISOString().split('T')[0];
const yearStartStr = () => startOfYear(new Date()).toISOString().split('T')[0];

export default function LifecycleReport() {
  const [periodStart, setPeriodStart] = useState(yearStartStr());
  const [periodEnd, setPeriodEnd] = useState(todayStr());

  const { data: aspects = [] } = useQuery({
    queryKey: ['environmentalAspects'],
    queryFn: () => db.EnvironmentalAspect.list('-created_at', 5000),
  });
  // Same real, already-computed co2e_kg fields Reports.jsx's CarbonReport
  // and IsoLifecycleReport already chart in detail — this page rolls the
  // same figures up by lifecycle stage instead of duplicating that logic.
  const { data: receiving = [] } = useQuery({
    queryKey: ['receivings'],
    queryFn: () => db.Receiving.list('-date_received', 5000),
  });
  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => db.Dispatch.list('-dispatch_date', 5000),
  });
  const { data: warehouseStock = [] } = useQuery({
    queryKey: ['warehouseStock'],
    queryFn: () => db.WarehouseStock.list('-transfer_date', 5000),
  });
  const { data: utilityLogs = [] } = useQuery({
    queryKey: ['utilityLogs'],
    queryFn: () => db.UtilityLog.list('-reading_date', 5000),
  });
  const { data: wasteRecords = [] } = useQuery({
    queryKey: ['wasteRecordsForLifecycleReport'],
    queryFn: async () => {
      const rows = await db.WasteRecord.list('-date', 5000);
      return rows.map(normalizeWasteRecord);
    },
  });
  const { data: wasteFactors = DEFAULT_EMISSION_FACTORS } = useQuery({
    queryKey: ['wasteEmissionFactorsForLifecycleReport'],
    queryFn: async () => {
      const rows = await db.AppSettings.list('key', 5000);
      const row = rows.find(r => r.key === EMISSION_FACTORS_KEY);
      if (!row?.value) return DEFAULT_EMISSION_FACTORS;
      try { return { ...DEFAULT_EMISSION_FACTORS, ...JSON.parse(row.value) }; }
      catch { return DEFAULT_EMISSION_FACTORS; }
    },
  });
  // Packaging: each BottlingRun logs exactly which packaging items and
  // quantities it consumed (packaging_costs, set in BottlingFloor.jsx's
  // FIFO packaging depletion) — matched by name against RawMaterial's
  // emission_factor_kg_co2e (set in Settings → Packaging Materials).
  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingRunsForLifecycleReport'],
    queryFn: () => db.BottlingRun.list('-date', 5000),
  });
  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => db.RawMaterial.list('name', 5000),
  });

  const inRange = (dateStr) => !!dateStr && dateStr >= periodStart && dateStr <= periodEnd;

  const stats = useMemo(() => {
    const aspectsByStage = {};
    for (const s of STAGES) aspectsByStage[s.id] = { total: 0, significant: 0 };
    for (const a of aspects) {
      if (!aspectsByStage[a.lifecycle_stage]) continue;
      aspectsByStage[a.lifecycle_stage].total++;
      if (a.is_significant) aspectsByStage[a.lifecycle_stage].significant++;
    }

    const inboundCo2e = receiving.filter(r => inRange(r.date_received)).reduce((s, r) => s + (r.co2e_kg || 0), 0);

    const periodUtility = utilityLogs.filter(l => inRange(l.reading_date));
    const utilityCo2e = periodUtility.reduce((s, l) => s + (l.electricity_kwh || 0) * ELECTRICITY_EF + ((l.water_litres || 0) / 1000) * WATER_EF, 0);

    const outboundCo2e = dispatches.filter(d => inRange(d.dispatch_date)).reduce((s, d) => s + (d.co2e_kg || 0), 0);
    const transferCo2e = warehouseStock.filter(w => inRange(w.transfer_date)).reduce((s, w) => s + (w.co2e_kg || 0), 0);

    const disposalCo2e = wasteRecords.filter(r => inRange(r.date)).reduce((s, r) => s + co2eFor(r, wasteFactors), 0);

    const factorByName = new Map(rawMaterials.map(m => [(m.name || '').toLowerCase().trim(), m.emission_factor_kg_co2e]));
    let packagingCo2e = 0;
    let packagingLinesWithFactor = 0;
    let packagingLinesMissingFactor = 0;
    for (const run of bottlingRuns.filter(r => inRange(r.date))) {
      for (const line of Array.isArray(run.packaging_costs) ? run.packaging_costs : []) {
        const factor = factorByName.get((line.name || '').toLowerCase().trim());
        if (factor != null) {
          packagingCo2e += (line.qty_used || 0) * factor;
          packagingLinesWithFactor++;
        } else {
          packagingLinesMissingFactor++;
        }
      }
    }
    const packagingNote = packagingLinesWithFactor === 0
      ? 'No packaging items have an emission factor set yet — add them in Settings → Packaging Materials'
      : packagingLinesMissingFactor > 0
        ? `From bottling runs — ${packagingLinesMissingFactor} packaging line${packagingLinesMissingFactor !== 1 ? 's' : ''} excluded (no factor set)`
        : 'From bottling runs (all packaging items have a factor set)';

    return {
      raw_materials: { ...aspectsByStage.raw_materials, co2e: inboundCo2e, tracked: true, note: 'Inbound freight (Receiving)' },
      production: { ...aspectsByStage.production, co2e: utilityCo2e, tracked: true, note: "Site electricity + water — an approximation, since meters aren't stage-specific" },
      packaging: { ...aspectsByStage.packaging, co2e: packagingCo2e, tracked: packagingLinesWithFactor > 0, note: packagingNote },
      distribution: { ...aspectsByStage.distribution, co2e: outboundCo2e + transferCo2e, tracked: true, note: 'Outbound dispatch + 3PL warehouse transfer freight' },
      disposal: { ...aspectsByStage.disposal, co2e: disposalCo2e, tracked: true, note: 'Waste disposal (indicative emission factors — adjust in Waste Tracker)' },
    };
  }, [aspects, receiving, dispatches, warehouseStock, utilityLogs, wasteRecords, wasteFactors, bottlingRuns, rawMaterials, periodStart, periodEnd]);

  const totalTracked = STAGES.reduce((sum, stage) => sum + (stats[stage.id].co2e || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Lifecycle Report" subtitle="Carbon footprint and significant aspects by ISO 14001 lifecycle stage" />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs">Period start</Label>
            <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Period end</Label>
            <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Total measured CO₂e</p>
            <p className="text-2xl font-bold text-primary">{totalTracked.toFixed(1)} kg</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAGES.map(stage => {
          const s = stats[stage.id];
          const Icon = stage.icon;
          return (
            <Card key={stage.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <p className="font-semibold text-sm">{stage.label}</p>
                </div>
                <div>
                  {s.tracked ? (
                    <p className="text-xl font-bold">{s.co2e.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">kg CO₂e</span></p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Not yet tracked</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Badge variant="secondary" className="text-xs">{s.total} aspect{s.total !== 1 ? 's' : ''}</Badge>
                  {s.significant > 0 && <Badge className="bg-red-100 text-red-700 text-xs">{s.significant} significant</Badge>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="p-4 flex items-start gap-3 bg-muted/30">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          For detailed transport-level breakdowns (per-customer, per-shipment, by transport method), see{' '}
          <Link to="/reports" className="text-primary underline">Reports → Carbon Footprint / ISO Lifecycle</Link>.
          This page rolls those same figures up by lifecycle stage and cross-references them against the{' '}
          <Link to="/aspects-register" className="text-primary underline">Aspects & Impacts Register</Link>.
          {' '}Set packaging emission factors and certifications under{' '}
          <Link to="/settings" className="text-primary underline">Settings → Distillery → Packaging Materials</Link>.
        </p>
      </Card>
    </div>
  );
}
