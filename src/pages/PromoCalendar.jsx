import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Megaphone, MapPin, Pencil, Trash2, Calendar } from 'lucide-react';
import { format, parseISO, isBefore, startOfToday } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const EVENT_TYPES = [
  { value: 'promotion', label: 'Promotion' },
  { value: 'activation', label: 'Activation' },
  { value: 'tasting', label: 'Tasting' },
  { value: 'other', label: 'Other' },
];

const TYPE_STYLES = {
  promotion: 'bg-primary/10 text-primary',
  activation: 'bg-amber-100 text-amber-700',
  tasting: 'bg-emerald-100 text-emerald-700',
  other: 'bg-muted text-muted-foreground',
};

const blankForm = () => ({
  title: '', description: '', event_type: 'promotion', start_date: '', end_date: '',
  location: '', customer_id: '', product_name: '',
});

function EventForm({ form, set, customers, products }) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Title</Label>
        <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. In-store tasting — Liquorland Fitzroy" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <Select value={form.event_type} onValueChange={(v) => set('event_type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Product</Label>
          <Select value={form.product_name || 'none'} onValueChange={(v) => set('product_name', v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {products.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start Date</Label>
          <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required />
        </div>
        <div>
          <Label>End Date</Label>
          <Input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} placeholder="Leave blank for a single day" />
        </div>
      </div>
      <div>
        <Label>Location</Label>
        <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. store address or venue" />
      </div>
      <div>
        <Label>Customer</Label>
        <Select value={form.customer_id || 'none'} onValueChange={(v) => set('customer_id', v === 'none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Optional — link to a customer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Anything the team on the ground should know" />
      </div>
    </div>
  );
}

export default function PromoCalendar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [form, setForm] = useState(blankForm());
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const { data: events = [], isLoading } = useQuery({ queryKey: ['promoEvents'], queryFn: () => db.PromoEvent.list('start_date', 1000) });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => db.Customer.list('business_name', 5000) });
  const { data: products = [] } = useQuery({ queryKey: ['recipes'], queryFn: () => db.Recipe.list('name', 500) });

  const customerById = new Map(customers.map((c) => [c.id, c]));

  const openNew = () => { setEditingEvent(null); setForm(blankForm()); setShowForm(true); };
  const openEdit = (ev) => {
    setEditingEvent(ev);
    setForm({
      title: ev.title || '', description: ev.description || '', event_type: ev.event_type || 'promotion',
      start_date: ev.start_date || '', end_date: ev.end_date || '', location: ev.location || '',
      customer_id: ev.customer_id || '', product_name: ev.product_name || '',
    });
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_type: form.event_type,
        start_date: form.start_date,
        end_date: form.end_date || null,
        location: form.location.trim() || null,
        customer_id: form.customer_id || null,
        product_name: form.product_name || null,
      };
      if (editingEvent) return db.PromoEvent.update(editingEvent.id, payload);
      return db.PromoEvent.create({ ...payload, created_by_user_id: user?.id || null, created_by_name: user?.full_name || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promoEvents'] });
      toast.success(editingEvent ? 'Event updated' : 'Event added');
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message || 'Failed to save event'),
  });

  const deleteMutation = useMutation({
    mutationFn: (ev) => db.PromoEvent.delete(ev.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promoEvents'] });
      toast.success('Event removed');
      setDeletingEvent(null);
    },
    onError: (e) => toast.error(e.message || 'Failed to remove event'),
  });

  const today = startOfToday();
  const upcoming = events.filter((e) => !e.start_date || !isBefore(parseISO(e.end_date || e.start_date), today));
  const past = events.filter((e) => e.start_date && isBefore(parseISO(e.end_date || e.start_date), today));

  const dateRange = (ev) => {
    if (!ev.start_date) return '—';
    const start = format(parseISO(ev.start_date), 'd MMM yyyy');
    if (!ev.end_date || ev.end_date === ev.start_date) return start;
    return `${start} – ${format(parseISO(ev.end_date), 'd MMM yyyy')}`;
  };

  const EventCard = ({ ev }) => (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-semibold text-sm text-foreground">{ev.title}</p>
            <Badge className={`text-xs font-medium ${TYPE_STYLES[ev.event_type] || TYPE_STYLES.other}`}>
              {EVENT_TYPES.find((t) => t.value === ev.event_type)?.label || ev.event_type}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> {dateRange(ev)}
          </p>
          {ev.location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3.5 h-3.5" /> {ev.location}
            </p>
          )}
          {(ev.customer_id || ev.product_name) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {ev.customer_id && customerById.get(ev.customer_id)?.business_name}
              {ev.customer_id && ev.product_name && ' · '}
              {ev.product_name}
            </p>
          )}
          {ev.description && <p className="text-sm text-foreground mt-2">{ev.description}</p>}
          {ev.created_by_name && <p className="text-xs text-muted-foreground mt-2">Added by {ev.created_by_name}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ev)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingEvent(ev)}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Promo Calendar" subtitle="Promotions, tastings, and activations the whole sales team can see and add to">
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add Event</Button>
      </PageHeader>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : events.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <Megaphone className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No promo events yet.</p>
          <Button size="sm" onClick={openNew}>Add the first one</Button>
        </Card>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <div className="space-y-2">{upcoming.map((ev) => <EventCard key={ev.id} ev={ev} />)}</div>
            )}
          </div>
          {past.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">Past</h2>
              <div className="space-y-2 opacity-70">{past.map((ev) => <EventCard key={ev.id} ev={ev} />)}</div>
            </div>
          )}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editingEvent ? 'Edit Event' : 'Add Promo Event'}</DialogTitle></DialogHeader>
          <EventForm form={form} set={set} customers={customers} products={products} />
          <Button className="w-full mt-2" disabled={!form.title.trim() || !form.start_date || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? 'Saving…' : editingEvent ? 'Save Changes' : 'Add Event'}
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingEvent} onOpenChange={(v) => !v && setDeletingEvent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove event?</AlertDialogTitle>
            <AlertDialogDescription>This will remove "{deletingEvent?.title}" from the promo calendar. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deletingEvent)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
