import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { format, parseISO, startOfWeek, startOfMonth, endOfMonth, subMonths, startOfQuarter, startOfToday } from 'date-fns';
import { daysSince } from '@/lib/customerHealth';
import { REQUEST_TYPES, REQUEST_STATUSES } from '@/components/customers/RequestDialog';

const VISIT_TYPE_LABELS = {
  sales_visit: 'Sales visit',
  relationship_visit: 'Relationship visit',
  stock_check: 'Stock check',
  new_customer_visit: 'New customer visit',
  promotion: 'Promotion',
  product_presentation: 'Product presentation',
  other: 'Other',
};

const OUTCOME_LABELS = {
  no_action: 'No action required',
  follow_up_required: 'Follow-up required',
  order_placed: 'Order placed',
  pricing_requested: 'Pricing requested',
  product_requested: 'Product requested',
  issue_raised: 'Issue raised',
  other: 'Other',
};

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'custom', label: 'Custom' },
];

function presetRange(key) {
  const today = startOfToday();
  switch (key) {
    case 'today': return { from: today, to: new Date() };
    case 'week': return { from: startOfWeek(today, { weekStartsOn: 1 }), to: new Date() };
    case 'month': return { from: startOfMonth(today), to: new Date() };
    case 'last_month': { const m = subMonths(today, 1); return { from: startOfMonth(m), to: endOfMonth(m) }; }
    case 'quarter': return { from: startOfQuarter(today), to: new Date() };
    default: return null;
  }
}

function toCsv(rows, headers) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export default function CustomerVisitReport({ rows }) {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const range = preset === 'custom' ? { from: parseISO(customFrom), to: parseISO(customTo) } : presetRange(preset);

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const d = parseISO(dateStr);
    return d >= range.from && d <= range.to;
  };

  const computed = useMemo(() => {
    const perCustomer = rows.map((r) => {
      const visitsInRange = r.activities.filter((a) => a.type === 'visit' && inRange(a.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
      const contactsInRange = r.activities.filter((a) => inRange(a.date));
      const requestsInRange = r.requests.filter((req) => inRange(req.date_received));
      return { ...r, visitsInRange, contactsInRange, requestsInRange };
    });

    const visited = perCustomer.filter((r) => r.visitsInRange.length > 0);
    const totalVisits = perCustomer.reduce((s, r) => s + r.visitsInRange.length, 0);
    const storesVisited = visited.length;
    const avgVisits = storesVisited > 0 ? totalVisits / storesVisited : 0;
    const totalContacts = perCustomer.reduce((s, r) => s + r.contactsInRange.length, 0);
    const followUpsOverdue = visited.filter((r) => r.followUp?.overdue).length;
    const openRequests = visited.reduce((s, r) => s + r.requestsInRange.filter((req) => req.status !== 'resolved').length, 0);

    return { perCustomer, visited, totalVisits, storesVisited, avgVisits, totalContacts, followUpsOverdue, openRequests };
  }, [rows, range.from, range.to]);

  const exportCsv = () => {
    const headers = ['Customer', 'Region', 'Visit Date', 'Visited By', 'Visit Type', 'Outcome', 'Notes', 'Follow-up Date', 'Follow-up Task', 'Requests'];
    const csvRows = computed.visited.flatMap((r) => r.visitsInRange.map((v) => ({
      Customer: r.customer.business_name,
      Region: r.customer.region || '',
      'Visit Date': v.date || '',
      'Visited By': v.recorded_by || '',
      'Visit Type': VISIT_TYPE_LABELS[v.subtype] || v.subtype || '',
      Outcome: OUTCOME_LABELS[v.outcome] || v.outcome || '',
      Notes: v.notes || '',
      'Follow-up Date': v.follow_up_required ? (v.follow_up_date || '') : '',
      'Follow-up Task': v.follow_up_required ? (v.follow_up_task || '') : '',
      Requests: r.requestsInRange.map((req) => `${REQUEST_TYPES.find((t) => t.value === req.request_type)?.label || req.request_type} (${req.status})`).join('; '),
    })));
    const csv = toCsv(csvRows, headers);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `customer-visit-report-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Date Range</Label>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {PRESETS.map((p) => (
                <Button key={p.key} size="sm" variant={preset === p.key ? 'default' : 'outline'} onClick={() => setPreset(p.key)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 ml-auto" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['Visits', computed.totalVisits],
          ['Stores Visited', computed.storesVisited],
          ['Average Visits', computed.avgVisits.toFixed(2)],
          ['Contacts Made', computed.totalContacts],
          ['Follow-ups Overdue', computed.followUpsOverdue],
          ['Open Requests', computed.openRequests],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
          </Card>
        ))}
      </div>

      {computed.visited.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No customer visits logged in this period</Card>
      ) : (
        <div className="space-y-4">
          {computed.visited.map((r) => (
            <Card
              key={r.customer.id}
              className="p-4 cursor-pointer transition-colors hover:border-primary/40"
              onClick={() => navigate(`/customers/${r.customer.id}`)}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-foreground hover:underline">{r.customer.business_name}</p>
                  <p className="text-xs text-muted-foreground">{r.customer.region || '—'}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{r.visitsInRange.length} visit{r.visitsInRange.length === 1 ? '' : 's'} in period</span>
              </div>

              <div className="space-y-3">
                {r.visitsInRange.map((v) => (
                  <div key={v.id} className="border-l-2 border-border pl-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{v.date ? format(parseISO(v.date), 'd MMM yyyy') : '—'}</span>
                      {v.recorded_by && <span>· {v.recorded_by}</span>}
                      <span>· {VISIT_TYPE_LABELS[v.subtype] || v.subtype}</span>
                      {v.outcome && <span>· {OUTCOME_LABELS[v.outcome] || v.outcome}</span>}
                    </div>
                    {v.notes && <p className="text-sm text-foreground mt-1">{v.notes}</p>}
                    {v.follow_up_required && (
                      <p className="text-xs mt-1">
                        <span className={v.follow_up_date && daysSince(v.follow_up_date) > 0 ? 'text-destructive font-medium' : 'text-warning font-medium'}>Follow-up</span>
                        {v.follow_up_date && ` — ${format(parseISO(v.follow_up_date), 'd MMM yyyy')}`}
                        {v.follow_up_task && `: ${v.follow_up_task}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {r.requestsInRange.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Orders / Requests</p>
                  <div className="space-y-1">
                    {r.requestsInRange.map((req) => (
                      <div key={req.id} className="text-sm flex flex-wrap items-center gap-x-2">
                        <span className="font-medium text-foreground">{REQUEST_TYPES.find((t) => t.value === req.request_type)?.label || req.request_type}</span>
                        {req.description && <span className="text-muted-foreground">— {req.description}</span>}
                        <span className={`ml-auto text-xs shrink-0 ${req.status === 'resolved' ? 'text-success' : 'text-warning'}`}>
                          {REQUEST_STATUSES.find((s) => s.value === req.status)?.label || req.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
