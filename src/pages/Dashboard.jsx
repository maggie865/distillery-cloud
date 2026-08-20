import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Droplets, Flame, Wine, Warehouse, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { format, formatDistanceToNow, startOfMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import QuickActions from '@/components/dashboard/QuickActions';
import QuickLinks from '@/components/dashboard/QuickLinks';
import StockOverview from '@/components/dashboard/StockOverview';
import ActiveTanks from '@/components/dashboard/ActiveTanks';
import ComplianceAlerts from '@/components/dashboard/ComplianceAlerts';
import UserDashboard from '@/components/dashboard/UserDashboard';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAdminDashboard = user?.role !== 'user';

  const { data: allReceivings = [] } = useQuery({
    queryKey: ['receivings'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 2000),
    enabled: isAdminDashboard,
  });
  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => base44.entities.BottlingRun.list('-date', 200),
    enabled: isAdminDashboard,
  });
  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => base44.entities.Dispatch.list('-dispatch_date', 2000),
    enabled: isAdminDashboard,
  });
  const { data: distillationRuns = [] } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 500),
    enabled: isAdminDashboard,
  });
  const { data: dilutions = [] } = useQuery({
    queryKey: ['dilutions'],
    queryFn: () => base44.entities.Dilution.list('-date', 5),
    enabled: isAdminDashboard,
  });
  const { data: distillations = [] } = useQuery({
    queryKey: ['distillations'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 5),
    enabled: isAdminDashboard,
  });
  const { data: bottlings = [] } = useQuery({
    queryKey: ['bottlings'],
    queryFn: () => base44.entities.BottlingRun.list('-date', 5),
    enabled: isAdminDashboard,
  });
  const { data: thresholds = [] } = useQuery({
    queryKey: ['stockThresholds'],
    queryFn: () => base44.entities.StockThreshold.list('material_name', 200),
    enabled: isAdminDashboard,
  });

  if (!isAdminDashboard) {
    return <UserDashboard userName={user?.full_name} />;
  }

  // ── Stats derived from source records ────────────────────────────────────

  const monthStart = startOfMonth(new Date());
  const isThisMonth = (dateStr) => dateStr && new Date(dateStr) >= monthStart;

  // Ethanol: received minus consumed in distillation
  const ethanolReceivings = allReceivings.filter(r => (r.material_type || '').toLowerCase() === 'ethanol');
  const totalEthanolReceived = ethanolReceivings.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const totalEthanolConsumed = distillationRuns.reduce((sum, r) => sum + (r.input_volume || 0), 0);
  const totalEthanolLitres = Math.max(0, totalEthanolReceived - totalEthanolConsumed);

  const ethanolReceivedThisMonth = ethanolReceivings
    .filter(r => isThisMonth(r.date_received))
    .reduce((sum, r) => sum + (r.quantity || 0), 0);
  const ethanolConsumedThisMonth = distillationRuns
    .filter(r => isThisMonth(r.date))
    .reduce((sum, r) => sum + (r.input_volume || 0), 0);
  const ethanolDeltaThisMonth = ethanolReceivedThisMonth - ethanolConsumedThisMonth;

  // LALs: received minus consumed
  const totalLALsReceived = ethanolReceivings.reduce((sum, r) => sum + (r.lals || 0), 0);
  const totalLALsConsumed = distillationRuns.reduce((sum, r) => sum + (r.input_lals || 0), 0);
  const totalLALs = Math.max(0, totalLALsReceived - totalLALsConsumed);

  // Bottles: produced minus dispatched
  const totalBottlesProduced = bottlingRuns.reduce((sum, r) => sum + (r.bottles_produced || 0), 0);
  const totalBottlesDispatched = dispatches.reduce((sum, d) => sum + (d.quantity_bottles || 0), 0);
  const totalBottles = Math.max(0, totalBottlesProduced - totalBottlesDispatched);

  const bottlesProducedThisMonth = bottlingRuns
    .filter(r => isThisMonth(r.date))
    .reduce((sum, r) => sum + (r.bottles_produced || 0), 0);

  // Unique materials received
  const uniqueMaterials = new Set(
    allReceivings.map(r => (r.material_name || '').toLowerCase().trim())
  ).size;

  // Low stock alerts
  const receivedTotalsByName = allReceivings.reduce((acc, r) => {
    const key = (r.material_name || '').toLowerCase().trim();
    acc[key] = (acc[key] || 0) + (r.quantity || 0);
    return acc;
  }, {});

  const lowStockAlerts = thresholds
    .map(t => {
      const key = (t.material_name || '').toLowerCase().trim();
      const qty = receivedTotalsByName[key] || 0;
      if (qty <= t.threshold) {
        return { name: t.material_name, qty, threshold: t.threshold, unit: t.unit };
      }
      return null;
    })
    .filter(Boolean);

  // Today's operations
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaysRuns = [...distillationRuns, ...bottlingRuns, ...dilutions]
    .filter(r => r.date === todayStr).length;

  // Recent activity
  const recentActivity = [
    ...dilutions.map(d => ({ ...d, _type: 'Dilution', _date: d.date })),
    ...distillations.map(d => ({ ...d, _type: 'Distillation', _date: d.date })),
    ...bottlings.map(d => ({ ...d, _type: 'Bottling', _date: d.date })),
  ].sort((a, b) => new Date(b._date) - new Date(a._date)).slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Today's Operations"
        subtitle={`${format(new Date(), 'EEEE, MMMM d')} · ${todaysRuns} run${todaysRuns !== 1 ? 's' : ''} logged today`}
      />

      <QuickActions />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Materials"
          value={uniqueMaterials}
          subtitle="unique items in stock"
          icon={Warehouse}
          tone="primary"
        />
        <StatCard
          title="Ethanol Stock"
          value={`${totalEthanolLitres.toFixed(1)}L`}
          subtitle={`${totalLALs.toFixed(1)} LALs remaining`}
          trend={ethanolDeltaThisMonth !== 0 ? {
            direction: ethanolDeltaThisMonth >= 0 ? 'up' : 'down',
            goodDirection: 'up',
            label: `${ethanolDeltaThisMonth >= 0 ? '+' : ''}${ethanolDeltaThisMonth.toFixed(0)}L this month`,
          } : undefined}
          icon={Droplets}
          tone="warning"
        />
        <StatCard
          title="Bottles in Stock"
          value={totalBottles.toLocaleString()}
          subtitle={`${totalBottlesDispatched.toLocaleString()} dispatched`}
          trend={bottlesProducedThisMonth > 0 ? {
            direction: 'up', goodDirection: 'up',
            label: `+${bottlesProducedThisMonth.toLocaleString()} this month`,
          } : undefined}
          icon={Wine}
          tone="primary"
        />
        <StatCard
          title="LALs Produced"
          value={totalLALsReceived.toFixed(1)}
          subtitle={`${totalLALsConsumed.toFixed(1)} consumed`}
          icon={TrendingUp}
          tone="info"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <ActiveTanks />
        <ComplianceAlerts />
      </div>

      {lowStockAlerts.length > 0 && (
        <Card
          className="mb-8 p-4 cursor-pointer"
          onClick={() => navigate('/inventory')}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-warning" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Stock Alerts — {lowStockAlerts.length} item{lowStockAlerts.length !== 1 ? 's' : ''} below minimum
            </p>
            <span className="ml-auto text-xs text-primary font-medium">View inventory →</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockAlerts.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-warning/5 border border-warning/20 rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium text-foreground">{a.name}</span>
                <span className="text-xs text-muted-foreground">{a.qty.toFixed(2)} / {a.threshold} {a.unit}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <QuickLinks />

      <StockOverview />

      <Card className="p-0 overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
        </div>
        {recentActivity.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No activity yet. Start by receiving some raw materials.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    {item._type === 'Dilution' && <Droplets className="w-4 h-4 text-primary" />}
                    {item._type === 'Distillation' && <Flame className="w-4 h-4 text-primary" />}
                    {item._type === 'Bottling' && <Wine className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item._type} — {item.batch_number || item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item._date ? formatDistanceToNow(new Date(item._date), { addSuffix: true }) : '—'}
                    </p>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
