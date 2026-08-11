import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, Clock, MessageCircleWarning, Inbox } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { daysSince, visitFrequencyLabel } from '@/lib/customerHealth';

function Section({ title, icon: Icon, tone, items, renderReason }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Icon className={`w-4 h-4 ${tone}`} /> {title}
        <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((r) => <AttentionCard key={r.customer.id} row={r} reason={renderReason(r)} />)}
      </div>
    </div>
  );
}

function AttentionCard({ row, reason }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/customers/${row.customer.id}`)} className="text-left">
      <Card className="p-4 h-full transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <p className="font-semibold text-sm text-foreground">{row.customer.business_name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{row.customer.city || row.customer.region || ''}</p>
        <p className="text-xs text-warning font-medium mt-2">{reason}</p>
      </Card>
    </button>
  );
}

export default function NeedsAttentionList({ rows, isLoading }) {
  if (isLoading) return <p className="text-center py-16 text-muted-foreground text-sm">Loading…</p>;

  const overdueFollowUp = rows.filter((r) => r.followUp?.overdue);
  const overdueVisit = rows.filter((r) => r.visitOverdue && !r.followUp?.overdue);
  const noRecentContact = rows.filter((r) => r.contactOverdue && !r.visitOverdue && !r.followUp?.overdue);
  const openRequestOnly = rows.filter((r) => r.openRequests.length > 0 && !r.followUp?.overdue && !r.visitOverdue && !r.contactOverdue);

  const nothing = overdueFollowUp.length === 0 && overdueVisit.length === 0 && noRecentContact.length === 0 && openRequestOnly.length === 0;

  if (nothing) {
    return (
      <Card className="p-10 text-center space-y-2">
        <CheckCircle2 className="w-8 h-8 mx-auto text-success/60" />
        <p className="text-sm font-medium text-foreground">All caught up</p>
        <p className="text-sm text-muted-foreground">No customers currently need attention.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Section
        title="Overdue Follow-up"
        icon={AlertTriangle}
        tone="text-destructive"
        items={overdueFollowUp}
        renderReason={(r) => `Follow-up was due ${format(parseISO(r.followUp.date), 'd MMM')}`}
      />
      <Section
        title="Overdue Visit"
        icon={Clock}
        tone="text-warning"
        items={overdueVisit}
        renderReason={(r) => r.lastVisit
          ? `${daysSince(r.lastVisit)} days since last visit (${visitFrequencyLabel(r.customer.visit_frequency)})`
          : `Never visited (${visitFrequencyLabel(r.customer.visit_frequency)})`}
      />
      <Section
        title="No Recent Contact"
        icon={MessageCircleWarning}
        tone="text-warning"
        items={noRecentContact}
        renderReason={(r) => r.lastContact ? `${daysSince(r.lastContact)} days since last contact` : 'No contact recorded'}
      />
      <Section
        title="Open Requests"
        icon={Inbox}
        tone="text-info"
        items={openRequestOnly}
        renderReason={(r) => `${r.openRequests.length} open request${r.openRequests.length !== 1 ? 's' : ''}`}
      />
    </div>
  );
}
