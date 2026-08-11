import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useCustomersWithStats } from '@/hooks/useCustomersWithStats';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import LogVisitDialog from '@/components/customers/LogVisitDialog';
import LogContactDialog from '@/components/customers/LogContactDialog';
import { Store, MessageCircle, ArrowRight } from 'lucide-react';
import { format, startOfMonth, formatDistanceToNow } from 'date-fns';
import { daysSince } from '@/lib/customerHealth';

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function SalesOverview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { rows, activities, requests, isLoading } = useCustomersWithStats();
  const [logVisitFor, setLogVisitFor] = useState(null);
  const [logContactFor, setLogContactFor] = useState(null);

  const priority = useMemo(() => {
    const withReason = rows.map((r) => {
      if (r.followUp?.overdue) return { r, reason: `Follow-up ${daysSince(r.followUp.date)}d overdue`, severity: 0 };
      if (r.visitOverdue) return { r, reason: `Visit ${r.lastVisit ? `${daysSince(r.lastVisit)}d overdue` : 'never recorded'}`, severity: 1 };
      if (r.contactOverdue) return { r, reason: `No contact in ${r.lastContact ? daysSince(r.lastContact) : '30+'} days`, severity: 1 };
      if (r.openRequests.length > 0) return { r, reason: `${r.openRequests.length} open request${r.openRequests.length !== 1 ? 's' : ''}`, severity: 2 };
      return null;
    }).filter(Boolean);
    return withReason.sort((a, b) => a.severity - b.severity).slice(0, 8);
  }, [rows]);

  const monthStart = startOfMonth(new Date());
  const visitedThisMonth = new Set(activities.filter((a) => a.type === 'visit' && a.date >= format(monthStart, 'yyyy-MM-dd')).map((a) => a.customer_id)).size;
  const visitsThisMonth = activities.filter((a) => a.type === 'visit' && a.date >= format(monthStart, 'yyyy-MM-dd')).length;
  const overdueVisits = rows.filter((r) => r.visitOverdue).length;
  const followUpsDue = rows.filter((r) => r.followUp).length;
  const openRequestsCount = requests.filter((r) => r.status !== 'resolved').length;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaysFollowUps = rows.filter((r) => r.followUp?.date === todayStr);

  const recentActivity = useMemo(() => {
    const withCustomer = activities.map((a) => ({ ...a, customer: rows.find((r) => r.customer.id === a.customer_id)?.customer }));
    return withCustomer.filter((a) => a.customer).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);
  }, [activities, rows]);

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader
        title={`${greetingForNow()}, ${(user?.full_name || '').split(' ')[0] || ''}.`}
        subtitle={priority.length > 0 ? `You've got ${priority.length} customer${priority.length !== 1 ? 's' : ''} to follow up with.` : "You're all caught up — no customers need attention right now."}
      />

      {!isLoading && priority.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Needs Your Attention</h2>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/customers')}>View all <ArrowRight className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="divide-y divide-border">
            {priority.map(({ r, reason, severity }) => (
              <div key={r.customer.id} className="flex items-center gap-3 p-4">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${severity === 0 ? 'bg-destructive' : severity === 1 ? 'bg-warning' : 'bg-info'}`} />
                <button onClick={() => navigate(`/customers/${r.customer.id}`)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium text-foreground truncate">{r.customer.business_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{reason}</p>
                </button>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setLogVisitFor(r.customer)}>
                  <Store className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Log Visit</span>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setLogContactFor(r.customer)}>
                  <MessageCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Log Contact</span>
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Customer Activity</h2>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          {[
            ['Customers', rows.length],
            ['Visited This Month', visitedThisMonth],
            ['Visits This Month', visitsThisMonth],
            ['Overdue Visits', overdueVisits],
            ['Follow-ups Due', followUpsDue],
            ['Open Requests', openRequestsCount],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Today's Follow-ups</h2>
          {todaysFollowUps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nothing due today.</p>
          ) : (
            <div className="space-y-2">
              {todaysFollowUps.map((r) => (
                <button key={r.customer.id} onClick={() => navigate(`/customers/${r.customer.id}`)} className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                  <p className="text-sm font-medium text-foreground">{r.customer.business_name}</p>
                  <p className="text-xs text-muted-foreground">{r.followUp.task || 'Follow-up due'}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Recent Customer Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No activity recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((a) => (
                <button key={a.id} onClick={() => navigate(`/customers/${a.customer.id}`)} className="w-full text-left flex items-center justify-between gap-2 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.customer.business_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.type === 'visit' ? 'Visit' : 'Contact'}{a.notes ? ` — ${a.notes}` : ''}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true }) : ''}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {logVisitFor && <LogVisitDialog customer={logVisitFor} open={!!logVisitFor} onOpenChange={(v) => !v && setLogVisitFor(null)} />}
      {logContactFor && <LogContactDialog customer={logContactFor} open={!!logContactFor} onOpenChange={(v) => !v && setLogContactFor(null)} />}
    </div>
  );
}
