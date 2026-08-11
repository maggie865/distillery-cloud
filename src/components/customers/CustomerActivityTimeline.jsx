import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Store, Phone, Mail, MessageSquare, Users, History } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const CONTACT_ICONS = { phone: Phone, email: Mail, text: MessageSquare, social_media: MessageSquare, in_person: Users, other: MessageSquare };

const OUTCOME_LABELS = {
  no_action: 'No action required',
  follow_up_required: 'Follow-up required',
  order_placed: 'Order placed',
  pricing_requested: 'Pricing requested',
  product_requested: 'Product requested',
  issue_raised: 'Issue raised',
  other: 'Other',
};

const VISIT_TYPE_LABELS = {
  sales_visit: 'Sales visit',
  relationship_visit: 'Relationship visit',
  stock_check: 'Stock check',
  new_customer_visit: 'New customer visit',
  promotion: 'Promotion',
  product_presentation: 'Product presentation',
  other: 'Other',
};

const CONTACT_METHOD_LABELS = {
  phone: 'Phone Call', email: 'Email', text: 'Text', social_media: 'Social Media', in_person: 'In Person', other: 'Contact',
};

function ActivityRow({ activity }) {
  const isVisit = activity.type === 'visit';
  const Icon = isVisit ? Store : (CONTACT_ICONS[activity.subtype] || MessageSquare);
  const title = isVisit
    ? `Visit — ${VISIT_TYPE_LABELS[activity.subtype] || activity.subtype}`
    : (activity.subject || CONTACT_METHOD_LABELS[activity.subtype] || 'Contact');

  return (
    <div className="relative pl-6">
      <div className="absolute -left-[7px] top-0.5 w-3.5 h-3.5 rounded-full bg-card border-2 border-primary" />
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">
          {activity.date ? format(parseISO(activity.date), 'd MMM yyyy') : ''}{activity.time ? ` · ${activity.time}` : ''}
        </span>
        {activity.recorded_by && <span className="text-xs text-muted-foreground">· {activity.recorded_by}</span>}
      </div>
      {activity.notes && <p className="text-sm text-foreground mb-1">{activity.notes}</p>}
      {isVisit && activity.discussed_products?.length > 0 && (
        <p className="text-xs text-muted-foreground mb-1">Discussed: {activity.discussed_products.join(', ')}</p>
      )}
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        {activity.outcome && <span>Outcome: {OUTCOME_LABELS[activity.outcome] || activity.outcome}</span>}
        {activity.status && <span>Status: {activity.status === 'resolved' ? 'Resolved' : 'Open'}</span>}
      </div>
      {activity.follow_up_required && (
        <p className="text-xs text-warning mt-1">
          Follow-up required{activity.follow_up_date ? ` — ${format(parseISO(activity.follow_up_date), 'd MMM yyyy')}` : ''}
          {activity.follow_up_task ? `: ${activity.follow_up_task}` : ''}
        </p>
      )}
    </div>
  );
}

function OrderRow({ order }) {
  return (
    <div className="relative pl-6">
      <div className="absolute -left-[7px] top-0.5 w-3.5 h-3.5 rounded-full bg-card border-2 border-success" />
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-sm font-semibold text-foreground">Order</span>
        <span className="text-xs text-muted-foreground">{order.dispatch_date ? format(parseISO(order.dispatch_date), 'd MMM yyyy') : ''}</span>
      </div>
      <p className="text-sm text-foreground">{order.quantity_bottles} × {order.product_name}</p>
    </div>
  );
}

export default function CustomerActivityTimeline({ activities, orders = [] }) {
  const items = useMemo(() => {
    const activityItems = activities.map((a) => ({ kind: 'activity', date: a.created_at || a.date, data: a }));
    const orderItems = orders.map((o) => ({ kind: 'order', date: o.created_at || o.dispatch_date, data: o }));
    return [...activityItems, ...orderItems].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [activities, orders]);

  if (items.length === 0) {
    return (
      <Card className="p-10 text-center space-y-2">
        <History className="w-8 h-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No activity recorded yet — log a visit or contact to get started.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-5">Activity Timeline</h2>
      <div className="relative pl-2 space-y-6">
        <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
        {items.map((item) => (
          item.kind === 'activity'
            ? <ActivityRow key={`a-${item.data.id}`} activity={item.data} />
            : <OrderRow key={`o-${item.data.id}`} order={item.data} />
        ))}
      </div>
    </Card>
  );
}
