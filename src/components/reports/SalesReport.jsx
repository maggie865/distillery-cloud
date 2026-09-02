import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { useCustomerGroups } from '@/hooks/useCustomerGroups';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '@/components/ui/Pagination';
import StatCard from '@/components/shared/StatCard';
import { Download, PackageCheck, Users, Receipt, Wine } from 'lucide-react';
import { format, parseISO, startOfMonth } from 'date-fns';
import { toast } from 'sonner';

const CHANNEL_LABELS = { wholesale: 'Wholesale', cellar_door: 'Cellar Door', shopify: 'Shopify', airpoints: 'Airpoints', website: 'Website', other: 'Other' };

const ALL = '__all__';

function toCsv(rows, headers) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export default function SalesReport({ dispatches = [], startDate, endDate }) {
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => db.Customer.list('business_name', 5000) });
  const { groups, groupsByCustomerId } = useCustomerGroups();

  const [filterProduct, setFilterProduct] = useState(ALL);
  const [filterSize, setFilterSize] = useState(ALL);
  const [filterChannel, setFilterChannel] = useState(ALL);
  const [filterOrigin, setFilterOrigin] = useState(ALL);
  const [filterGroup, setFilterGroup] = useState(ALL);
  const [includeSamples, setIncludeSamples] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const rangeStart = startDate ? parseISO(startDate) : startOfMonth(new Date());
  const rangeEnd = endDate ? parseISO(endDate) : new Date();
  const rangeEndInclusive = new Date(rangeEnd);
  rangeEndInclusive.setHours(23, 59, 59, 999);

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    try {
      const d = parseISO(dateStr);
      return d >= rangeStart && d <= rangeEndInclusive;
    } catch { return false; }
  };

  const monthLabel = `${format(rangeStart, 'dd MMM yyyy')} – ${format(rangeEnd, 'dd MMM yyyy')}`;

  // Resolve each dispatch's customer group(s) via the same case-insensitive
  // business_name match every other screen uses to bridge dispatch's
  // free-text customer_name to a real Customer row (dispatch has no
  // customer_id FK).
  const customerIdByName = useMemo(() => {
    const m = new Map();
    for (const c of customers) m.set((c.business_name || '').trim().toLowerCase(), c.id);
    return m;
  }, [customers]);

  const groupIdsForDispatch = (d) => {
    const customerId = customerIdByName.get((d.customer_name || '').trim().toLowerCase());
    if (!customerId) return [];
    return (groupsByCustomerId.get(customerId) || []).map((g) => g.id);
  };

  const monthDispatches = useMemo(
    () => dispatches.filter((d) => inRange(d.dispatch_date) && (includeSamples || !d.sample_dispatch)),
    [dispatches, rangeStart, rangeEnd, includeSamples]
  );

  // Filter option lists — scoped to what's actually in this period, so the
  // dropdowns never offer a choice that would return zero rows.
  const productOptions = useMemo(() => [...new Set(monthDispatches.map((d) => d.product_name).filter(Boolean))].sort(), [monthDispatches]);
  const sizeOptions = useMemo(() => [...new Set(monthDispatches.map((d) => d.bottle_size_ml).filter(Boolean))].sort((a, b) => a - b), [monthDispatches]);
  const channelOptions = useMemo(() => [...new Set(monthDispatches.map((d) => d.sales_channel || 'wholesale'))].sort(), [monthDispatches]);
  const originOptions = useMemo(() => [...new Set(monthDispatches.map((d) => d.dispatched_from || 'Bluff'))].sort(), [monthDispatches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monthDispatches.filter((d) => {
      if (filterProduct !== ALL && d.product_name !== filterProduct) return false;
      if (filterSize !== ALL && Number(d.bottle_size_ml) !== Number(filterSize)) return false;
      if (filterChannel !== ALL && (d.sales_channel || 'wholesale') !== filterChannel) return false;
      if (filterOrigin !== ALL && (d.dispatched_from || 'Bluff') !== filterOrigin) return false;
      if (filterGroup !== ALL && !groupIdsForDispatch(d).includes(filterGroup)) return false;
      if (q) {
        const hay = `${d.customer_name || ''} ${d.order_reference || ''} ${d.batch_number || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [monthDispatches, filterProduct, filterSize, filterChannel, filterOrigin, filterGroup, search, customerIdByName, groupsByCustomerId]);

  const totalBottles = filtered.reduce((s, d) => s + (d.quantity_bottles || 0), 0);
  const totalLals = filtered.reduce((s, d) => s + (d.total_lals || 0), 0);
  const uniqueCustomers = new Set(filtered.map((d) => (d.customer_name || '').trim().toLowerCase())).size;

  const resetFilters = () => {
    setFilterProduct(ALL); setFilterSize(ALL); setFilterChannel(ALL); setFilterOrigin(ALL); setFilterGroup(ALL); setSearch('');
    setPage(1);
  };

  const hasActiveFilters = filterProduct !== ALL || filterSize !== ALL || filterChannel !== ALL || filterOrigin !== ALL || filterGroup !== ALL || search.trim() !== '';

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportCsv = () => {
    if (filtered.length === 0) { toast.warning('No dispatches match the current filters'); return; }
    const headers = ['Date', 'Customer', 'Product', 'Batch', 'Bottle Size', 'Bottles', 'LALs', 'Sales Channel', 'Origin', 'Order Ref'];
    const rows = filtered.map((d) => ({
      Date: d.dispatch_date || '',
      Customer: d.customer_name || '',
      Product: d.product_name || '',
      Batch: d.batch_number || '',
      'Bottle Size': d.bottle_size_ml || '',
      Bottles: d.quantity_bottles || 0,
      LALs: d.total_lals?.toFixed ? d.total_lals.toFixed(3) : d.total_lals || '',
      'Sales Channel': CHANNEL_LABELS[d.sales_channel] || d.sales_channel || 'Wholesale',
      Origin: d.dispatched_from || 'Bluff',
      'Order Ref': d.order_reference || '',
    }));
    const csv = toCsv(rows, headers);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sales_${startDate}_to_${endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Sales Report</h3>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Product</Label>
            <Select value={filterProduct} onValueChange={(v) => { setFilterProduct(v); setPage(1); }}>
              <SelectTrigger className="w-48 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All products</SelectItem>
                {productOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Bottle Size</Label>
            <Select value={filterSize} onValueChange={(v) => { setFilterSize(v); setPage(1); }}>
              <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sizes</SelectItem>
                {sizeOptions.map((s) => <SelectItem key={s} value={String(s)}>{s}ml</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sales Channel</Label>
            <Select value={filterChannel} onValueChange={(v) => { setFilterChannel(v); setPage(1); }}>
              <SelectTrigger className="w-40 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All channels</SelectItem>
                {channelOptions.map((c) => <SelectItem key={c} value={c}>{CHANNEL_LABELS[c] || c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origin</Label>
            <Select value={filterOrigin} onValueChange={(v) => { setFilterOrigin(v); setPage(1); }}>
              <SelectTrigger className="w-36 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All origins</SelectItem>
                {originOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {groups.length > 0 && (
            <div>
              <Label className="text-xs">Customer Group</Label>
              <Select value={filterGroup} onValueChange={(v) => { setFilterGroup(v); setPage(1); }}>
                <SelectTrigger className="w-40 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All groups</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs">Search</Label>
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Customer, order ref, batch…" className="mt-1" />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2 cursor-pointer">
            <input type="checkbox" checked={includeSamples} onChange={(e) => setIncludeSamples(e.target.checked)} className="w-3.5 h-3.5" />
            Include tasting/promo samples
          </label>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">Clear filters</Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 ml-auto" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Dispatches" value={filtered.length.toLocaleString()} sub={hasActiveFilters ? 'matching filters' : monthLabel} icon={Receipt} color="text-primary" />
        <StatCard label="Bottles" value={totalBottles.toLocaleString()} sub="total quantity" icon={PackageCheck} color="text-primary" />
        <StatCard label="LALs" value={totalLals.toFixed(2)} sub="litres abs. alcohol" icon={Wine} color="text-primary" />
        <StatCard label="Customers" value={uniqueCustomers.toLocaleString()} sub="unique, matching filters" icon={Users} color="text-primary" />
      </div>

      {/* Dispatch list */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">Dispatches — {monthLabel}{hasActiveFilters ? ' (filtered)' : ''}</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Bottles</TableHead>
                <TableHead className="text-right">LALs</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Order Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No dispatches match{hasActiveFilters ? ' the current filters' : ' this period'}</TableCell></TableRow>
              ) : paged.map((d, i) => (
                <TableRow key={d.id || i}>
                  <TableCell className="text-sm">{d.dispatch_date ? format(parseISO(d.dispatch_date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{d.customer_name}</TableCell>
                  <TableCell className="text-sm">{d.product_name}</TableCell>
                  <TableCell className="text-sm font-mono">{d.batch_number || '—'}</TableCell>
                  <TableCell className="text-sm text-right">{d.bottle_size_ml}ml</TableCell>
                  <TableCell className="text-sm text-right font-semibold">{d.quantity_bottles}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{d.total_lals?.toFixed(3) || '—'}</TableCell>
                  <TableCell className="text-sm">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent text-accent-foreground">{CHANNEL_LABELS[d.sales_channel] || 'Wholesale'}</span>
                    {d.sample_dispatch && <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Sample</span>}
                  </TableCell>
                  <TableCell className="text-sm">{d.dispatched_from || 'Bluff'}</TableCell>
                  <TableCell className="text-sm font-mono">{d.order_reference || '—'}</TableCell>
                </TableRow>
              ))}
              {filtered.length > 0 && (
                <TableRow className="border-t-2 bg-muted/30 font-bold">
                  <TableCell colSpan={5}>Totals ({filtered.length} dispatches)</TableCell>
                  <TableCell className="text-right">{totalBottles.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{totalLals.toFixed(3)}</TableCell>
                  <TableCell colSpan={3}></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </Card>
    </div>
  );
}
