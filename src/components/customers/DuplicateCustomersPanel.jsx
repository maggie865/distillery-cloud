import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';

const norm = (s) => (s || '').trim().toLowerCase();

// Groups customers that share a normalized name or a non-empty email —
// real matching on real fields, not a Xero-specific check, so this is
// useful whether or not Xero is ever connected.
function findDuplicateGroups(customers) {
  const byName = new Map();
  const byEmail = new Map();
  for (const c of customers) {
    const nameKey = norm(c.business_name);
    if (nameKey) (byName.get(nameKey) || byName.set(nameKey, []).get(nameKey)).push(c);
    const emailKey = norm(c.email);
    if (emailKey) (byEmail.get(emailKey) || byEmail.set(emailKey, []).get(emailKey)).push(c);
  }
  const seen = new Set();
  const groups = [];
  for (const group of [...byName.values(), ...byEmail.values()]) {
    if (group.length < 2) continue;
    const key = group.map((c) => c.id).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(group);
  }
  return groups;
}

export default function DuplicateCustomersPanel({ customers }) {
  const queryClient = useQueryClient();
  const [keepChoice, setKeepChoice] = useState({});

  const groups = useMemo(() => findDuplicateGroups(customers), [customers]);

  const mergeMutation = useMutation({
    mutationFn: async ({ keep, discard }) => {
      for (const dup of discard) {
        const activities = await db.CustomerActivity.filter({ customer_id: dup.id });
        for (const a of activities) await db.CustomerActivity.update(a.id, { customer_id: keep.id });
        const requests = await db.CustomerRequest.filter({ customer_id: dup.id });
        for (const r of requests) await db.CustomerRequest.update(r.id, { customer_id: keep.id });
        await db.Customer.delete(dup.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customerActivities'] });
      queryClient.invalidateQueries({ queryKey: ['customerRequests'] });
      toast.success('Customers merged');
    },
    onError: (e) => toast.error('Merge failed: ' + e.message),
  });

  if (groups.length === 0) {
    return (
      <Card className="p-8 text-center space-y-2">
        <CheckCircle2 className="w-8 h-8 mx-auto text-success/60" />
        <p className="text-sm text-muted-foreground">No possible duplicate customers found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group, i) => {
        const keepId = keepChoice[i] || group[0].id;
        const keep = group.find((c) => c.id === keepId);
        const discard = group.filter((c) => c.id !== keepId);
        return (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Copy className="w-4 h-4 text-warning" />
              <p className="text-sm font-semibold text-foreground">Possible duplicate — {group.length} records</p>
            </div>
            <div className="space-y-2 mb-3">
              {group.map((c) => (
                <label key={c.id} className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input
                    type="radio"
                    name={`keep-${i}`}
                    checked={c.id === keepId}
                    onChange={() => setKeepChoice((prev) => ({ ...prev, [i]: c.id }))}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.business_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email || c.delivery_address}</p>
                  </div>
                </label>
              ))}
            </div>
            <Button
              size="sm"
              className="gap-2"
              disabled={mergeMutation.isPending}
              onClick={() => {
                if (confirm(`Merge ${discard.length} record(s) into "${keep.business_name}"? This cannot be undone.`)) {
                  mergeMutation.mutate({ keep, discard });
                }
              }}
            >
              Keep "{keep.business_name}", merge the rest
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
