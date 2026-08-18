import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { useCustomersWithStats } from '@/hooks/useCustomersWithStats';
import { useCustomerGroups } from '@/hooks/useCustomerGroups';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Search, X, Eye, EyeOff, Tag } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import Pagination from '@/components/ui/Pagination';
import CustomerHealthBadge from '@/components/customers/CustomerHealthBadge';
import CustomerFormDialog, { CUSTOMER_TYPES, CUSTOMER_STATUSES } from '@/components/customers/CustomerFormDialog';
import DuplicateCustomersPanel from '@/components/customers/DuplicateCustomersPanel';
import CustomerMapPanel from '@/components/customers/CustomerMapPanel';
import CustomerGroupsPanel from '@/components/customers/CustomerGroupsPanel';
import NeedsAttentionList from '@/components/customers/NeedsAttentionList';
import CustomerVisitReport from '@/components/customers/CustomerVisitReport';
import { daysSince } from '@/lib/customerHealth';
import { format, parseISO } from 'date-fns';

function relativeDays(dateStr) {
  if (!dateStr) return '—';
  const d = daysSince(dateStr);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

export default function Customers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { rows, isLoading } = useCustomersWithStats();
  const { groups, groupsByCustomerId, bulkAddToGroup } = useCustomerGroups();

  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [managerFilter, setManagerFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [visitOverdueOnly, setVisitOverdueOnly] = useState(false);
  const [followUpOverdueOnly, setFollowUpOverdueOnly] = useState(false);
  const [openRequestOnly, setOpenRequestOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkGroupChoice, setBulkGroupChoice] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const regions = useMemo(() => [...new Set(rows.map((r) => r.customer.region).filter(Boolean))].sort(), [rows]);
  const managers = useMemo(() => [...new Set(rows.map((r) => r.customer.account_manager).filter(Boolean))].sort(), [rows]);

  const filtered = rows.filter((r) => {
    const c = r.customer;
    const s = search.toLowerCase();
    const matchSearch = !s || c.business_name.toLowerCase().includes(s) || (c.city || '').toLowerCase().includes(s) || (c.primary_contact || '').toLowerCase().includes(s);
    const matchType = typeFilter === 'all' || c.customer_type === typeFilter;
    const matchRegion = regionFilter === 'all' || c.region === regionFilter;
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchManager = managerFilter === 'all' || c.account_manager === managerFilter;
    const matchGroup = groupFilter === 'all' || (groupsByCustomerId.get(c.id) || []).some((g) => g.id === groupFilter);
    const matchVisitOverdue = !visitOverdueOnly || r.visitOverdue;
    const matchFollowUp = !followUpOverdueOnly || r.followUp?.overdue;
    const matchRequest = !openRequestOnly || r.openRequests.length > 0;
    return matchSearch && matchType && matchRegion && matchStatus && matchManager && matchGroup && matchVisitOverdue && matchFollowUp && matchRequest;
  });
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const pagedAllSelected = paged.length > 0 && paged.every((r) => selectedIds.has(r.customer.id));
  const toggleRow = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllOnPage = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (pagedAllSelected) paged.forEach((r) => next.delete(r.customer.id));
    else paged.forEach((r) => next.add(r.customer.id));
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkAddToGroup = async () => {
    if (!bulkGroupChoice) return;
    setBulkBusy(true);
    try {
      await bulkAddToGroup([...selectedIds], bulkGroupChoice);
      setBulkGroupChoice('');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkSetTracking = async (enabled) => {
    setBulkBusy(true);
    try {
      await db.Customer.bulkUpdate([...selectedIds].map((id) => ({ id, follow_up_tracking_enabled: enabled })));
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`Visit tracking ${enabled ? 'enabled' : 'disabled'} for ${selectedIds.size} customer${selectedIds.size === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err.message || 'Failed to update visit tracking');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Customers" subtitle="Your customer accounts, activity and follow-ups">
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Customer
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="all">All Customers</TabsTrigger>
          <TabsTrigger value="attention">Needs Attention</TabsTrigger>
          <TabsTrigger value="visit-report">Visit Report</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="p-4 mb-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search name, city, contact…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" />
              </div>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {CUSTOMER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={regionFilter} onValueChange={(v) => { setRegionFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Region" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {CUSTOMER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={managerFilter} onValueChange={(v) => { setManagerFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="Account Manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Managers</SelectItem>
                  {managers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={groupFilter} onValueChange={(v) => { setGroupFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {groupFilter !== 'all' && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border text-sm">
                <span className="text-muted-foreground">Showing group:</span>
                <span className="font-medium">{groups.find((g) => g.id === groupFilter)?.name}</span>
                <button onClick={() => { setGroupFilter('all'); setPage(1); }} className="text-xs text-primary hover:underline">Clear</button>
              </div>
            )}
            <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={visitOverdueOnly} onChange={(e) => { setVisitOverdueOnly(e.target.checked); setPage(1); }} /> Visit overdue
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={followUpOverdueOnly} onChange={(e) => { setFollowUpOverdueOnly(e.target.checked); setPage(1); }} /> Follow-up overdue
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={openRequestOnly} onChange={(e) => { setOpenRequestOnly(e.target.checked); setPage(1); }} /> Has open request
              </label>
            </div>
          </Card>

          {selectedIds.size > 0 && (
            <Card className="p-3 mb-4 flex flex-wrap items-center gap-3 bg-accent/40 border-primary/20">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <div className="flex items-center gap-1.5">
                <Select value={bulkGroupChoice} onValueChange={setBulkGroupChoice} disabled={bulkBusy || groups.length === 0}>
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Add to group…" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={bulkBusy || !bulkGroupChoice} onClick={handleBulkAddToGroup}>
                  <Tag className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={bulkBusy} onClick={() => handleBulkSetTracking(true)}>
                <Eye className="w-3.5 h-3.5" /> Enable visit tracking
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={bulkBusy} onClick={() => handleBulkSetTracking(false)}>
                <EyeOff className="w-3.5 h-3.5" /> Disable visit tracking
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 ml-auto text-muted-foreground" onClick={clearSelection}>
                <X className="w-3.5 h-3.5" /> Clear
              </Button>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={pagedAllSelected} onCheckedChange={toggleAllOnPage} aria-label="Select all on page" />
                    </TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Order</TableHead>
                    <TableHead>Last Visit</TableHead>
                    <TableHead>Last Contact</TableHead>
                    <TableHead>Next Follow-up</TableHead>
                    <TableHead>Account Manager</TableHead>
                    <TableHead>Health</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : paged.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No customers match these filters</TableCell></TableRow>
                  ) : paged.map((r) => (
                    <TableRow key={r.customer.id} className="cursor-pointer" onClick={() => navigate(`/customers/${r.customer.id}`)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(r.customer.id)} onCheckedChange={() => toggleRow(r.customer.id)} aria-label={`Select ${r.customer.business_name}`} />
                      </TableCell>
                      <TableCell className="font-semibold">{r.customer.business_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.customer.city || r.customer.region || '—'}</TableCell>
                      <TableCell className="capitalize">{(r.customer.status || 'active').replace('_', ' ')}</TableCell>
                      <TableCell className="text-sm">{relativeDays(r.lastOrder)}</TableCell>
                      <TableCell className="text-sm">{relativeDays(r.lastVisit)}</TableCell>
                      <TableCell className="text-sm">{relativeDays(r.lastContact)}</TableCell>
                      <TableCell className="text-sm">
                        {r.followUp ? (r.followUp.overdue ? <span className="text-destructive font-medium">Overdue</span> : format(parseISO(r.followUp.date), 'd MMM')) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{r.customer.account_manager || '—'}</TableCell>
                      <TableCell><CustomerHealthBadge health={r.health} reason={r.healthReason} showLabel={false} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          </Card>
        </TabsContent>

        <TabsContent value="attention">
          <NeedsAttentionList rows={rows} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="visit-report">
          <CustomerVisitReport rows={rows} />
        </TabsContent>

        <TabsContent value="map">
          <CustomerMapPanel customers={filtered.map((r) => r.customer)} />
        </TabsContent>

        <TabsContent value="groups">
          <CustomerGroupsPanel onSelectGroup={(groupId) => { setGroupFilter(groupId); setPage(1); setActiveTab('all'); }} />
        </TabsContent>

        <TabsContent value="duplicates">
          <DuplicateCustomersPanel customers={rows.map((r) => r.customer)} />
        </TabsContent>
      </Tabs>

      <CustomerFormDialog customer={null} open={showForm} onOpenChange={setShowForm} />
    </div>
  );
}
