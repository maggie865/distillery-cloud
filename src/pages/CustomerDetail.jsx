import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/shared/StatCard';
import {
  ArrowLeft, Pencil, MapPin, Phone, Mail, Plus, ClipboardList,
  Store as StoreIcon, MessageCircle, CalendarClock, TrendingUp,
  ClipboardCheck, ShoppingCart, Package,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import CustomerHealthBadge from '@/components/customers/CustomerHealthBadge';
import CustomerActivityTimeline from '@/components/customers/CustomerActivityTimeline';
import LogVisitDialog from '@/components/customers/LogVisitDialog';
import LogContactDialog from '@/components/customers/LogContactDialog';
import RequestDialog, { REQUEST_TYPES, REQUEST_STATUSES } from '@/components/customers/RequestDialog';
import CustomerFormDialog from '@/components/customers/CustomerFormDialog';
import StockCheckDialog from '@/components/customers/StockCheckDialog';
import QuickOrderModal from '@/components/customers/QuickOrderModal';
import CustomerStockTable from '@/components/customers/CustomerStockTable';
import StockHistoryTimeline from '@/components/customers/StockHistoryTimeline';
import CustomerOrderHistoryTable from '@/components/customers/CustomerOrderHistoryTable';
import CustomerStockAlertsList from '@/components/customers/CustomerStockAlertsList';
import CustomerGroupTagEditor from '@/components/customers/CustomerGroupTagEditor';
import { useCustomerStock } from '@/hooks/useCustomerStock';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { computeCustomerStats, daysSince, visitFrequencyLabel } from '@/lib/customerHealth';

function StatusPill({ status }) {
  const styles = { open: 'bg-info/10 text-info', in_progress: 'bg-warning/10 text-warning', waiting: 'bg-muted text-muted-foreground', resolved: 'bg-success/10 text-success' };
  const label = REQUEST_STATUSES.find((s) => s.value === status)?.label || status;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || ''}`}>{label}</span>;
}

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();

  const [logVisitOpen, setLogVisitOpen] = useState(false);
  const [logContactOpen, setLogContactOpen] = useState(false);
  const [requestDialog, setRequestDialog] = useState(null); // 'new' | request object | null
  const [editOpen, setEditOpen] = useState(false);
  const [stockCheckOpen, setStockCheckOpen] = useState(false);
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);
  const [quickOrderPrefill, setQuickOrderPrefill] = useState(null);

  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: () => db.Customer.list('business_name', 5000) });
  const customer = customersQuery.data?.find((c) => c.id === customerId);

  const activitiesQuery = useQuery({ queryKey: ['customerActivities'], queryFn: () => db.CustomerActivity.list('-date', 5000) });
  const requestsQuery = useQuery({ queryKey: ['customerRequests'], queryFn: () => db.CustomerRequest.list('-date_received', 5000) });
  const dispatchesQuery = useQuery({ queryKey: ['dispatches'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });

  const activities = (activitiesQuery.data || []).filter((a) => a.customer_id === customerId);
  const requests = (requestsQuery.data || []).filter((r) => r.customer_id === customerId);
  const dispatches = dispatchesQuery.data || [];

  const customerStock = useCustomerStock(customerId);
  const customerOrdersData = useCustomerOrders(customerId);
  const stockAlerts = customerStock.rows.filter((r) => r.belowPar).map((r) => ({ product: r.product, currentStock: r.currentStock, parLevel: r.parLevel, suggestedOrderQty: r.suggestedOrderQty }));

  const openQuickOrder = (prefill = null) => { setQuickOrderPrefill(prefill); setQuickOrderOpen(true); };

  if (customersQuery.isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-xl font-semibold text-foreground mb-2">Customer not found</h1>
        <Button onClick={() => navigate('/customers')} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back to Customers</Button>
      </div>
    );
  }

  const stats = computeCustomerStats(customer, { activities, requests, dispatches });
  const orders = dispatches.filter((d) => (d.customer_name || '').trim().toLowerCase() === customer.business_name.trim().toLowerCase());
  const mapsQuery = encodeURIComponent(customer.delivery_address || '');

  return (
    <div>
      <button onClick={() => navigate('/customers')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-foreground">{customer.business_name}</h1>
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-success/10 text-success border-success/20">
              {(customer.status || 'active').replace('_', ' ')}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
            {(customer.city || customer.region) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {[customer.city, customer.region].filter(Boolean).join(', ')}</span>}
            {customer.account_manager && <span>Account Manager: <span className="text-foreground font-medium">{customer.account_manager}</span></span>}
          </div>
        </div>
        <Button variant="outline" className="gap-1.5 shrink-0" onClick={() => setEditOpen(true)}>
          <Pencil className="w-4 h-4" /> Edit Customer
        </Button>
      </div>

      <div className="mb-6">
        <CustomerGroupTagEditor customerId={customerId} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Log Visit', icon: StoreIcon, tone: 'bg-primary/10 text-primary', onClick: () => setLogVisitOpen(true) },
          { label: 'Stock Check', icon: ClipboardCheck, tone: 'bg-info/10 text-info', onClick: () => setStockCheckOpen(true) },
          { label: 'Quick Order', icon: ShoppingCart, tone: 'bg-primary/10 text-primary', onClick: () => openQuickOrder() },
          { label: 'Log Contact', icon: MessageCircle, tone: 'bg-info/10 text-info', onClick: () => setLogContactOpen(true) },
          { label: 'Create Follow-up', icon: CalendarClock, tone: 'bg-warning/10 text-warning', onClick: () => setRequestDialog('new') },
          { label: 'View Orders', icon: TrendingUp, tone: 'bg-success/10 text-success', onClick: () => document.getElementById('order-history')?.scrollIntoView({ behavior: 'smooth' }) },
        ].map((a) => (
          <button key={a.label} onClick={a.onClick} className="text-left">
            <Card className="p-4 flex flex-col items-center text-center gap-2 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${a.tone}`}><a.icon className="w-4 h-4" /></div>
              <span className="text-xs font-medium text-foreground">{a.label}</span>
            </Card>
          </button>
        ))}
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Health</p>
          <CustomerHealthBadge health={stats.health} reason={stats.healthReason} />
          {customer.follow_up_tracking_enabled === false && (
            <p className="text-[11px] text-muted-foreground mt-1.5">Not tracked for follow-ups</p>
          )}
        </Card>
        <StatCard title="Current Stock" value={customerStock.totalCurrentStock} subtitle="bottles on hand" icon={Package} tone="primary" />
        <StatCard title="Pending Orders" value={customerOrdersData.pendingCount} subtitle="not yet dispatched" icon={ShoppingCart} tone="warning" />
        <StatCard title="Last Order" value={stats.lastOrder ? `${daysSince(stats.lastOrder)}d ago` : '—'} subtitle={stats.lastOrder ? format(parseISO(stats.lastOrder), 'd MMM yyyy') : 'No orders recorded'} icon={TrendingUp} tone="info" />
        <StatCard title="Last Visit" value={stats.lastVisit ? `${daysSince(stats.lastVisit)}d ago` : '—'} subtitle={stats.lastVisit ? format(parseISO(stats.lastVisit), 'd MMM yyyy') : 'No visits recorded'} icon={StoreIcon} tone="primary" />
        <StatCard title="Last Contact" value={stats.lastContact ? `${daysSince(stats.lastContact)}d ago` : '—'} subtitle={stats.lastContact ? format(parseISO(stats.lastContact), 'd MMM yyyy') : 'No contact recorded'} icon={MessageCircle} tone="info" />
        <StatCard title="Stock Check" value={customerStock.lastStockCheckDate ? `${daysSince(customerStock.lastStockCheckDate)}d ago` : '—'} subtitle={customerStock.lastStockCheckDate ? format(parseISO(customerStock.lastStockCheckDate), 'd MMM yyyy') : 'Never checked'} icon={ClipboardCheck} tone="warning" />
        <StatCard title="Orders" value={stats.totalOrders} subtitle="from dispatch records" icon={ClipboardList} tone="primary" />
      </div>

      {stockAlerts.length > 0 && (
        <div className="mb-6">
          <CustomerStockAlertsList alerts={stockAlerts} onQuickOrder={(a) => openQuickOrder({ productId: a.product.id, suggestedQty: a.suggestedOrderQty })} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Contact card */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Contact</h2>
          {customer.primary_contact && (
            <div className="mb-3">
              <p className="text-sm font-medium text-foreground">{customer.primary_contact}</p>
              {customer.contact_role && <p className="text-xs text-muted-foreground">{customer.contact_role}</p>}
            </div>
          )}
          <div className="space-y-1.5 text-sm mb-4">
            {customer.phone && <p className="text-muted-foreground">{customer.phone}</p>}
            {customer.email && <p className="text-muted-foreground">{customer.email}</p>}
          </div>
          {customer.delivery_address && (
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Address</p>
              <p className="text-sm text-foreground flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" /> {customer.delivery_address}</p>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {customer.phone && <a href={`tel:${customer.phone}`}><Button variant="outline" size="sm" className="gap-1.5"><Phone className="w-3.5 h-3.5" /> Call</Button></a>}
            {customer.email && <a href={`mailto:${customer.email}`}><Button variant="outline" size="sm" className="gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</Button></a>}
            {customer.delivery_address && <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="gap-1.5"><MapPin className="w-3.5 h-3.5" /> Open in Maps</Button></a>}
          </div>
          {customer.visit_frequency && (
            <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
              Visit frequency: <span className="font-medium text-foreground">{visitFrequencyLabel(customer.visit_frequency)}</span>
              {stats.visitOverdue && <span className="text-destructive font-medium"> · Overdue</span>}
              {customer.follow_up_tracking_enabled === false && <span> · Not tracked for follow-ups</span>}
            </div>
          )}
        </Card>

        {/* Requests */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Requests</h2>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRequestDialog('new')}><Plus className="w-3.5 h-3.5" /> Add Request</Button>
          </div>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No requests recorded</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <button key={r.id} onClick={() => setRequestDialog(r)} className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{REQUEST_TYPES.find((t) => t.value === r.request_type)?.label || r.request_type}</span>
                    <StatusPill status={r.status} />
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">Received {r.date_received ? format(parseISO(r.date_received), 'd MMM yyyy') : '—'}{r.due_date && ` · Due ${format(parseISO(r.due_date), 'd MMM')}`}</p>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-5 mb-6">
        <CustomerStockTable rows={customerStock.rows} isLoading={customerStock.isLoading} />
        <StockHistoryTimeline history={customerStock.history} products={customerStock.products} />
        <div id="order-history">
          <CustomerOrderHistoryTable customerId={customerId} orders={customerOrdersData.orders} isLoading={customerOrdersData.isLoading} />
        </div>
      </div>

      <CustomerActivityTimeline activities={activities} orders={orders} />

      <LogVisitDialog customer={customer} open={logVisitOpen} onOpenChange={setLogVisitOpen} />
      <LogContactDialog customer={customer} open={logContactOpen} onOpenChange={setLogContactOpen} />
      <RequestDialog
        customer={customer}
        request={requestDialog && requestDialog !== 'new' ? requestDialog : null}
        open={!!requestDialog}
        onOpenChange={(v) => !v && setRequestDialog(null)}
      />
      <CustomerFormDialog customer={customer} open={editOpen} onOpenChange={setEditOpen} />
      <StockCheckDialog customer={customer} products={customerStock.products} open={stockCheckOpen} onOpenChange={setStockCheckOpen} />
      <QuickOrderModal customer={customer} open={quickOrderOpen} onOpenChange={setQuickOrderOpen} prefill={quickOrderPrefill} />
    </div>
  );
}
