import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useCustomersWithStats } from '@/hooks/useCustomersWithStats';
import { useCustomerStockAlerts } from '@/hooks/useCustomerStock';
import { useCustomerPins } from '@/hooks/useCustomerPins';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import LogVisitDialog from '@/components/customers/LogVisitDialog';
import LogContactDialog from '@/components/customers/LogContactDialog';
import CustomerFormDialog from '@/components/customers/CustomerFormDialog';
import CustomerStockAlertsList from '@/components/customers/CustomerStockAlertsList';
import { Store, MessageCircle, ArrowRight, PackageCheck, AlertTriangle, MailWarning, CheckCircle2, Star, UserPlus, BellRing } from 'lucide-react';
import { format, startOfMonth, formatDistanceToNow, parseISO, isBefore, startOfToday } from 'date-fns';
import { daysSince } from '@/lib/customerHealth';

const RESERVING_STATUSES = new Set(['pending', 'picking', 'ready']);

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function SalesOverview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSalesRep = user?.role === 'sales_rep';
  const { rows: allRows, activities: allActivities, requests: allRequests, isLoading } = useCustomersWithStats();
  const { alerts: allStockAlerts } = useCustomerStockAlerts();
  const { data: allDispatches = [] } = useQuery({ queryKey: ['dispatches-all'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });
  const { data: allCustomerOrders = [] } = useQuery({ queryKey: ['customerOrders'], queryFn: () => db.CustomerOrder.list('-order_date', 5000) });
  const { pinnedIds, togglePin } = useCustomerPins();
  const [logVisitFor, setLogVisitFor] = useState(null);
  const [logContactFor, setLogContactFor] = useState(null);
  const [showQuickLogVisit, setShowQuickLogVisit] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // A Sales Rep's whole dashboard is scoped to just their own book —
  // nothing here should ever surface another rep's customer or activity.
  const rows = isSalesRep ? allRows.filter((r) => r.customer.assigned_rep_id === user.id) : allRows;
  const myCustomerIds = new Set(rows.map((r) => r.customer.id));
  const myCustomerNames = new Set(rows.map((r) => (r.customer.business_name || '').trim().toLowerCase()));
  const activities = isSalesRep ? allActivities.filter((a) => myCustomerIds.has(a.customer_id)) : allActivities;
  const requests = isSalesRep ? allRequests.filter((r) => myCustomerIds.has(r.customer_id)) : allRequests;
  const stockAlerts = isSalesRep ? allStockAlerts.filter((a) => myCustomerIds.has(a.customer.id)) : allStockAlerts;
  const dispatches = isSalesRep ? allDispatches.filter((d) => myCustomerNames.has((d.customer_name || '').trim().toLowerCase())) : allDispatches;
  const customerOrders = isSalesRep ? allCustomerOrders.filter((o) => myCustomerIds.has(o.customer_id)) : allCustomerOrders;
  const pinnedRows = rows.filter((r) => pinnedIds.has(r.customer.id));

  const markFollowUpDoneMutation = useMutation({
    mutationFn: (activityId) => db.CustomerActivity.update(activityId, { follow_up_required: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerActivities'] });
      toast.success('Follow-up marked done');
    },
    onError: (e) => toast.error(e.message || 'Failed to update follow-up'),
  });

  const pendingDispatchCount = dispatches.filter((d) => RESERVING_STATUSES.has(d.status)).length;
  const lowStockCustomerCount = new Set(stockAlerts.map((a) => a.customer.id)).size;
  const ordersNeedingEmailResendCount = customerOrders.filter((o) => o.email_status === 'failed').length;

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

  // "Notify the rep who logged a follow-up when it's due" — no push/email
  // infrastructure exists yet, so this is the in-app equivalent: surfaced
  // here the next time they open the app on or after the due date.
  // Deliberately keyed off created_by_user_id (who actually logged it), not
  // customer ownership — uses the FULL activity/customer lists rather than
  // the already-scoped ones above, since a follow-up someone logged should
  // still surface to them even if the customer's assignment changes later.
  const myFollowUpsDue = useMemo(() => {
    if (!user?.id) return [];
    const today = startOfToday();
    return allActivities
      .filter((a) => a.created_by_user_id === user.id && a.follow_up_required && a.follow_up_date && !isBefore(today, parseISO(a.follow_up_date)))
      .map((a) => ({ ...a, customer: allRows.find((r) => r.customer.id === a.customer_id)?.customer }))
      .filter((a) => a.customer)
      .sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date));
  }, [allActivities, allRows, user?.id]);

  return (
    <div>
      <PageHeader
        title={`${greetingForNow()}, ${(user?.full_name || '').split(' ')[0] || ''}.`}
        subtitle={priority.length > 0 ? `You've got ${priority.length} customer${priority.length !== 1 ? 's' : ''} to follow up with.` : "You're all caught up — no customers need attention right now."}
      />

      {/* Always-visible quick actions — the two things a rep needs the
          moment they open the app on the road, without navigating anywhere
          first. Log Visit here opens the customer-picker variant of the
          dialog (no pre-selected customer); the per-row "Log Visit" buttons
          further down still jump straight in for a known customer. */}
      <div className="flex gap-3 mb-6">
        <Button className="flex-1 h-14 text-base gap-2" onClick={() => setShowQuickLogVisit(true)}>
          <Store className="w-5 h-5" /> Log a Visit
        </Button>
        <Button variant="outline" className="flex-1 h-14 text-base gap-2" onClick={() => setShowAddCustomer(true)}>
          <UserPlus className="w-5 h-5" /> Add Customer
        </Button>
      </div>

      {myFollowUpsDue.length > 0 && (
        <Card className="mb-6 overflow-hidden border-destructive/30">
          <div className="p-5 border-b border-border flex items-center gap-2 bg-destructive/5">
            <BellRing className="w-4 h-4 text-destructive" />
            <h2 className="text-sm font-semibold text-foreground">Your Follow-ups Due</h2>
            <span className="text-xs text-muted-foreground">— logged by you, due now</span>
          </div>
          <div className="divide-y divide-border">
            {myFollowUpsDue.map((a) => {
              const overdue = a.follow_up_date < todayStr;
              return (
                <div key={a.id} className="flex items-center gap-3 p-4">
                  <button onClick={() => navigate(`/customers/${a.customer.id}`)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-foreground truncate">{a.customer.business_name}</p>
                    <p className={`text-xs truncate ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {a.follow_up_task || 'Follow-up'} — {overdue ? `overdue since ${format(parseISO(a.follow_up_date), 'd MMM')}` : 'due today'}
                    </p>
                  </button>
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => markFollowUpDoneMutation.mutate(a.id)}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Done
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {pinnedRows.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="p-5 border-b border-border flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">Pinned Customers</h2>
          </div>
          <div className="divide-y divide-border">
            {pinnedRows.map((r) => (
              <div key={r.customer.id} className="flex items-center gap-3 p-4">
                <button onClick={() => navigate(`/customers/${r.customer.id}`)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium text-foreground truncate">{r.customer.business_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.customer.city || r.customer.region || ''}</p>
                </button>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setLogVisitFor(r.customer)}>
                  <Store className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Log Visit</span>
                </Button>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => togglePin(r.customer.id)} title="Unpin">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

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
                {severity === 0 && r.followUp?.activityId && (
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => markFollowUpDoneMutation.mutate(r.followUp.activityId)}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Mark Done</span>
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setLogVisitFor(r.customer)}>
                  <Store className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Log Visit</span>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setLogContactFor(r.customer)}>
                  <MessageCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Log Contact</span>
                </Button>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => togglePin(r.customer.id)} title={pinnedIds.has(r.customer.id) ? 'Unpin' : 'Pin to top'}>
                  <Star className={`w-4 h-4 ${pinnedIds.has(r.customer.id) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Orders Requiring Action</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button onClick={() => navigate('/dispatch')} className="text-left">
            <Card className="p-4 flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-warning/10 text-warning shrink-0"><PackageCheck className="w-5 h-5" /></div>
              <div><p className="text-2xl font-semibold text-foreground">{pendingDispatchCount}</p><p className="text-xs text-muted-foreground">Pending Dispatches</p></div>
            </Card>
          </button>
          <button onClick={() => document.getElementById('stock-alerts')?.scrollIntoView({ behavior: 'smooth' })} className="text-left">
            <Card className="p-4 flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-destructive/10 text-destructive shrink-0"><AlertTriangle className="w-5 h-5" /></div>
              <div><p className="text-2xl font-semibold text-foreground">{lowStockCustomerCount}</p><p className="text-xs text-muted-foreground">Low Stock Customers</p></div>
            </Card>
          </button>
          <Card className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-info/10 text-info shrink-0"><MailWarning className="w-5 h-5" /></div>
            <div><p className="text-2xl font-semibold text-foreground">{ordersNeedingEmailResendCount}</p><p className="text-xs text-muted-foreground">Orders Needing Email Resend</p></div>
          </Card>
        </div>
      </div>

      {stockAlerts.length > 0 && (
        <div id="stock-alerts" className="mb-6">
          <CustomerStockAlertsList alerts={stockAlerts} showCustomer />
        </div>
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
                <div key={r.customer.id} className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                  <button onClick={() => navigate(`/customers/${r.customer.id}`)} className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.customer.business_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.followUp.task || 'Follow-up due'}</p>
                  </button>
                  {r.followUp.activityId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 shrink-0"
                      onClick={() => markFollowUpDoneMutation.mutate(r.followUp.activityId)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Done
                    </Button>
                  )}
                </div>
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
      <LogVisitDialog customers={rows.map((r) => r.customer)} open={showQuickLogVisit} onOpenChange={setShowQuickLogVisit} />
      <CustomerFormDialog open={showAddCustomer} onOpenChange={setShowAddCustomer} />
    </div>
  );
}
