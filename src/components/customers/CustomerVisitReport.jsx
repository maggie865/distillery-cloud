import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import { format, parseISO, startOfWeek, startOfMonth, endOfMonth, subMonths, startOfQuarter, startOfToday } from 'date-fns';
import { daysSince, visitFrequencyLabel } from '@/lib/customerHealth';

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
      const visitsInRange = r.activities.filter((a) => a.type === 'visit' && inRange(a.date));
      const contactsInRange = r.activities.filter((a) => inRange(a.date));
      return { ...r, visitsInRange, contactsInRange };
    });

    const totalVisits = perCustomer.reduce((s, r) => s + r.visitsInRange.length, 0);
    const storesVisited = perCustomer.filter((r) => r.visitsInRange.length > 0).length;
    const avgVisits = storesVisited > 0 ? totalVisits / storesVisited : 0;
    const notVisited = perCustomer.filter((r) => r.visitsInRange.length === 0);
    const overdueCustomers = perCustomer.filter((r) => r.visitOverdue);
    const totalContacts = perCustomer.reduce((s, r) => s + r.contactsInRange.length, 0);
    const followUpsCompleted = perCustomer.reduce((s, r) => s + r.activities.filter((a) => inRange(a.date) && a.follow_up_required && a.status === 'resolved').length, 0);
    const followUpsOverdue = perCustomer.filter((r) => r.followUp?.overdue).length;
    const openRequests = perCustomer.reduce((s, r) => s + r.openRequests.length, 0);
    const resolvedRequests = perCustomer.reduce((s, r) => s + r.requests.filter((req) => req.status === 'resolved' && req.date_resolved && inRange(req.date_resolved)).length, 0);

    return { perCustomer, totalVisits, storesVisited, avgVisits, notVisited, overdueCustomers, totalContacts, followUpsCompleted, followUpsOverdue, openRequests, resolvedRequests };
  }, [rows, range.from, range.to]);

  const exportCsv = () => {
    const headers = ['Customer', 'Region', 'Last Visit', 'Visits During Period', 'Days Since Visit', 'Expected Frequency', 'Status'];
    const csvRows = computed.perCustomer.map((r) => ({
      Customer: r.customer.business_name,
      Region: r.customer.region || '',
      'Last Visit': r.lastVisit || '',
      'Visits During Period': r.visitsInRange.length,
      'Days Since Visit': r.lastVisit ? daysSince(r.lastVisit) : '',
      'Expected Frequency': visitFrequencyLabel(r.customer.visit_frequency),
      Status: r.visitOverdue ? 'Overdue' : 'OK',
    }));
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
          ['Customers Not Visited', computed.notVisited.length],
          ['Overdue Customers', computed.overdueCustomers.length],
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead>Visits During Period</TableHead>
                <TableHead>Days Since Visit</TableHead>
                <TableHead>Expected Frequency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computed.perCustomer.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No customers yet</TableCell></TableRow>
              ) : computed.perCustomer.map((r) => (
                <TableRow key={r.customer.id}>
                  <TableCell className="font-medium">{r.customer.business_name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.customer.region || '—'}</TableCell>
                  <TableCell className="text-sm">{r.lastVisit ? format(parseISO(r.lastVisit), 'd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm">{r.visitsInRange.length}</TableCell>
                  <TableCell className="text-sm">{r.lastVisit ? daysSince(r.lastVisit) : '—'}</TableCell>
                  <TableCell className="text-sm">{visitFrequencyLabel(r.customer.visit_frequency)}</TableCell>
                  <TableCell>
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${r.visitOverdue ? 'bg-destructive' : 'bg-success'}`} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
