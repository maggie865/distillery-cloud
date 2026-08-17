import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, RefreshCw, MapPin } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import Pagination from '@/components/ui/Pagination';

const PAGE_SIZE = 50;

const BLANK_FORM = {
  business_name: '',
  address: '',
  contact_email: '',
  contact_phone: '',
  goods_types: [],
  notes: ''
};

const GOODS_TYPE_OPTIONS = ['Ethanol', 'Botanicals', 'Packaging', 'Grain', 'Sugar', 'Water', 'Flavoring'];

export default function Suppliers() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const queryClient = useQueryClient();

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => db.Supplier.list('business_name', 5000),
  });
  const allSuppliers = suppliersQuery.data ?? [];
  const totalCount = allSuppliers.length;
  const data = allSuppliers.slice((page - 1) * pageSize, page * pageSize);

  const openNew = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setOpen(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      business_name: s.business_name || '',
      address: s.address || '',
      contact_email: s.contact_email || '',
      contact_phone: s.contact_phone || '',
      goods_types: s.goods_types || [],
      notes: s.notes || '',
    });
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      await db.Supplier.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setOpen(false);
      setForm(BLANK_FORM);
      toast.success('Supplier added');
    },
    onError: (err) => toast.error(err.message || 'Failed to add supplier'),
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      await db.Supplier.update(editingId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setOpen(false);
      setEditingId(null);
      setForm(BLANK_FORM);
      toast.success('Supplier updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update supplier'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await db.Supplier.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier deleted');
    },
    onError: (err) => toast.error(err.message || 'Failed to delete supplier'),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncing(true);
      toast.info('Sheet sync removed — add suppliers manually');
      return;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(data?.message || 'Suppliers synced from Google Sheet');
      setSyncing(false);
    },
    onError: () => {
      toast.error('Failed to sync suppliers');
      setSyncing(false);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleGoodsType = (type) => {
    setForm(f => ({
      ...f,
      goods_types: f.goods_types.includes(type)
        ? f.goods_types.filter(t => t !== type)
        : [...f.goods_types, type]
    }));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Suppliers" subtitle="Manage supplier information for receiving goods">
        <Button 
          variant="outline" 
          onClick={() => syncMutation.mutate()}
          disabled={syncing}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync from Sheet'}
        </Button>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Supplier
        </Button>
      </PageHeader>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(BLANK_FORM); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <Label>Business Name</Label>
              <Input 
                value={form.business_name} 
                onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} 
                required 
              />
            </div>

            <div>
              <Label>Address (Google Maps traceable)</Label>
              <Input 
                value={form.address} 
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} 
                placeholder="e.g., 123 Street Name, City, Country"
                required 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={form.contact_email} 
                  onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} 
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input 
                  value={form.contact_phone} 
                  onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} 
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Goods Types Supplied</Label>
              <div className="space-y-2">
                {GOODS_TYPE_OPTIONS.map(type => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={form.goods_types.includes(type)}
                      onChange={() => toggleGoodsType(type)}
                      className="rounded"
                    />
                    <span className="text-sm">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Input 
                value={form.notes} 
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} 
                placeholder="Optional notes"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Add Supplier'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Goods Types</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliersQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No suppliers yet</TableCell>
                </TableRow>
              ) : data.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.business_name}</TableCell>
                  <TableCell className="text-sm">
                    <a 
                      href={`https://maps.google.com/maps/search/${encodeURIComponent(s.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      {s.address}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm">{s.contact_email || '—'}</TableCell>
                  <TableCell className="text-sm">{s.contact_phone || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {s.goods_types?.length > 0 ? s.goods_types.join(', ') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm('Delete this supplier?')) deleteMutation.mutate(s.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileCardGrid>
          {suppliersQuery.isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
          ) : data.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No suppliers yet</p>
          ) : data.map(s => (
            <MobileCard
              key={s.id}
              title={s.business_name}
              subtitle={s.address}
              badge={<span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" /> Map</span>}
              actions={
                <>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => { if (confirm('Delete this supplier?')) deleteMutation.mutate(s.id); }}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                </>
              }
            >
              <MobileDetailRow label="Address" value={s.address} />
              <MobileDetailRow label="Email" value={s.contact_email || '—'} />
              <MobileDetailRow label="Phone" value={s.contact_phone || '—'} />
              <MobileDetailRow label="Goods" value={s.goods_types?.length > 0 ? s.goods_types.join(', ') : '—'} />
            </MobileCard>
          ))}
        </MobileCardGrid>
        <Pagination total={totalCount} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </Card>
    </div>
  );
}