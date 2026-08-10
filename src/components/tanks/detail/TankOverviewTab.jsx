import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { replayVolumeHistory } from '@/lib/tankMath';
import { ACTION_LABELS } from '@/components/tanks/detail/tankActionLabels';

const STAGE_DEFS = [
  { key: 'maceration', label: 'Botanical Infusion' },
  { key: 'distillation', label: 'Distillation' },
  { key: 'dilution', label: 'Dilution' },
  { key: 'maturation', label: 'Maturation' },
  { key: 'bottling', label: 'Bottling' },
];

function ProductionProgress({ tank, subBatches, distillationRuns, dilutions, bottlingRuns }) {
  if (!tank.current_batch) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Production Progress</h2>
        <p className="text-sm text-muted-foreground">No batch currently assigned to this tank.</p>
      </Card>
    );
  }

  const done = {
    maceration: subBatches.length > 0,
    distillation: distillationRuns.length > 0,
    dilution: dilutions.length > 0,
    maturation: bottlingRuns.length > 0 || (dilutions.length > 0 && (tank.current_volume || 0) > 0),
    bottling: bottlingRuns.length > 0,
  };
  const currentIdx = STAGE_DEFS.findIndex((s) => !done[s.key]);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Production Progress — {tank.current_batch}</h2>
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
        {STAGE_DEFS.map((stage, i) => {
          const isDone = done[stage.key];
          const isCurrent = i === currentIdx;
          return (
            <div key={stage.key} className="flex sm:flex-1 items-center gap-2 sm:flex-col sm:gap-1.5 sm:text-center">
              <div className="flex items-center sm:contents">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 ${
                  isDone ? 'bg-success border-success text-success-foreground'
                    : isCurrent ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-muted border-border text-muted-foreground'
                }`}>
                  {isDone ? <Check className="w-3.5 h-3.5" /> : <span className="text-xs font-semibold">{isCurrent ? '●' : i + 1}</span>}
                </div>
                {i < STAGE_DEFS.length - 1 && (
                  <div className={`hidden sm:block h-0.5 flex-1 mx-1 ${isDone ? 'bg-success' : 'bg-border'}`} />
                )}
              </div>
              <span className={`text-xs font-medium ${isCurrent ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'}`}>
                {stage.label}
              </span>
              {i < STAGE_DEFS.length - 1 && <div className="sm:hidden w-0.5 h-4 ml-3.5 bg-border" />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function VolumeOverTimeChart({ movements }) {
  const points = useMemo(() => {
    const raw = replayVolumeHistory(movements);
    return raw.map((p) => ({
      ...p,
      label: p.date ? format(parseISO(p.date), 'd MMM') : '',
    }));
  }, [movements]);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Volume Over Time</h2>
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No volume changes recorded yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={44} unit="L" />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }}
              formatter={(value) => [`${value} L`, 'Volume']}
            />
            <Line type="monotone" dataKey="volume" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function RecentActivity({ movements }) {
  const recent = useMemo(
    () => [...movements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6),
    [movements]
  );

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No activity recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {recent.map((m) => (
            <div key={m.id} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{ACTION_LABELS[m.action] || m.action}</p>
                <p className="text-xs text-muted-foreground">
                  {m.created_at ? formatDistanceToNow(new Date(m.created_at), { addSuffix: true }) : m.date}
                  {m.operator && ` · ${m.operator}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function TankOverviewTab({ tank, movements, subBatches, distillationRuns, dilutions, bottlingRuns }) {
  return (
    <div className="space-y-5">
      <ProductionProgress
        tank={tank}
        subBatches={subBatches}
        distillationRuns={distillationRuns}
        dilutions={dilutions}
        bottlingRuns={bottlingRuns}
      />
      <VolumeOverTimeChart movements={movements} />
      <RecentActivity movements={movements} />
    </div>
  );
}
