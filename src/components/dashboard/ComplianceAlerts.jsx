import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { ShieldCheck, AlertTriangle, Wrench, Thermometer } from 'lucide-react';
import { isBefore, startOfToday } from 'date-fns';

export default function ComplianceAlerts() {
  const navigate = useNavigate();

  const { data: recalls = [] } = useQuery({
    queryKey: ['foodRecalls'],
    queryFn: () => db.FoodRecall.list('-date_initiated', 100),
  });
  const { data: maintenance = [] } = useQuery({
    queryKey: ['maintenanceRecords'],
    queryFn: () => db.MaintenanceRecord.list('-date', 500),
  });
  const { data: tempLogs = [] } = useQuery({
    queryKey: ['temperatureLogsRecent'],
    queryFn: () => db.TemperatureLog.list('-date', 50),
  });

  const today = startOfToday();

  const activeRecalls = recalls.filter((r) => r.status && r.status !== 'closed');
  const overdueMaintenance = maintenance.filter(
    (m) => m.next_due_date && isBefore(new Date(m.next_due_date), today)
  );
  const outOfRangeTemps = tempLogs.filter((t) => t.in_range === false);

  const alerts = [
    ...activeRecalls.map((r) => ({
      id: `recall-${r.id}`,
      icon: AlertTriangle,
      tone: 'bg-destructive/10 text-destructive',
      title: `Active recall: ${r.product_name || r.recall_number}`,
      sub: `Status: ${(r.status || '').replace(/_/g, ' ')}`,
      path: '/food-recall',
    })),
    ...overdueMaintenance.map((m) => ({
      id: `maint-${m.id}`,
      icon: Wrench,
      tone: 'bg-warning/10 text-warning',
      title: `Overdue: ${m.equipment_name || m.check_item_name || m.maintenance_type}`,
      sub: `Was due ${m.next_due_date}`,
      path: '/maintenance',
    })),
    ...outOfRangeTemps.map((t) => ({
      id: `temp-${t.id}`,
      icon: Thermometer,
      tone: 'bg-destructive/10 text-destructive',
      title: `${t.unit_name || 'Unit'} out of range`,
      sub: `${t.temperature_c}°C on ${t.date}`,
      path: '/temperature-logs',
    })),
  ].slice(0, 6);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Compliance Alerts</h2>
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center text-center py-8 text-muted-foreground">
          <ShieldCheck className="w-8 h-8 mb-2 text-success/60" />
          <p className="text-sm">All clear - nothing needs attention.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <button
              key={a.id}
              onClick={() => navigate(a.path)}
              className="w-full flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/40 transition-colors"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${a.tone}`}>
                <a.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                <p className="text-xs text-muted-foreground truncate">{a.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
