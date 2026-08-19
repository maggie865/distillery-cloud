import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Wine, CheckSquare, Wrench, ChevronRight } from 'lucide-react';
import { isBefore, startOfToday, format } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';

const CHECKLIST_TEMPLATES_KEY = 'checklist_templates';

export default function UserDashboard({ userName }) {
  const navigate = useNavigate();

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => db.BottlingRun.list('-date', 200),
  });
  const { data: maintenance = [] } = useQuery({
    queryKey: ['maintenanceRecords'],
    queryFn: () => db.MaintenanceRecord.list('-date', 500),
  });
  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 5000),
  });

  const inProgressRuns = bottlingRuns.filter((r) => r.status === 'in_progress');

  const today = startOfToday();
  const overdueMaintenance = maintenance.filter(
    (m) => m.next_due_date && isBefore(new Date(m.next_due_date), today)
  );

  const templates = (() => {
    const row = appSettings.find((r) => r.key === CHECKLIST_TEMPLATES_KEY);
    if (!row?.value) return [];
    try { return JSON.parse(row.value); } catch { return []; }
  })();

  const links = [
    {
      key: 'bottling-floor',
      label: 'Bottling Floor',
      description: 'Log and manage bottling runs',
      path: '/bottling-floor',
      icon: Wine,
      tone: 'bg-primary/10 text-primary',
      stat: inProgressRuns.length > 0
        ? `${inProgressRuns.length} run${inProgressRuns.length !== 1 ? 's' : ''} in progress`
        : 'No runs in progress',
    },
    {
      key: 'checklists',
      label: 'Daily Checks',
      description: 'Checklists and the bottle washer pre-use check',
      path: '/daily-checks',
      icon: CheckSquare,
      tone: 'bg-info/10 text-info',
      stat: `${templates.length} checklist${templates.length !== 1 ? 's' : ''} available`,
    },
    {
      key: 'maintenance',
      label: 'Maintenance',
      description: 'Equipment checks & repairs',
      path: '/maintenance',
      icon: Wrench,
      tone: overdueMaintenance.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
      stat: overdueMaintenance.length > 0
        ? `${overdueMaintenance.length} overdue`
        : 'Up to date',
    },
  ];

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader
        title={`Welcome back${userName ? `, ${userName.split(' ')[0]}` : ''}`}
        subtitle={format(new Date(), 'EEEE, MMMM d')}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {links.map((l) => (
          <button key={l.key} onClick={() => navigate(l.path)} className="text-left">
            <Card className="p-6 h-full flex flex-col gap-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${l.tone}`}>
                  <l.icon className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{l.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{l.description}</p>
              </div>
              <p className="text-xs font-medium text-muted-foreground mt-auto pt-2 border-t border-border">{l.stat}</p>
            </Card>
          </button>
        ))}
      </div>

      {overdueMaintenance.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Maintenance needs attention</h2>
          <div className="space-y-2">
            {overdueMaintenance.slice(0, 5).map((m) => (
              <button
                key={m.id}
                onClick={() => navigate('/maintenance')}
                className="w-full flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                  <Wrench className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.equipment_name || m.check_item_name || m.maintenance_type}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">Was due {m.next_due_date}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
