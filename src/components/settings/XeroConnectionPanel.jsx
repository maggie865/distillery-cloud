import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Link2, Unlink, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// Connect/disconnect Xero here; the actual "pull invoices in as draft
// dispatches" action lives as a Sync button on the Dispatch page instead,
// since that's where the results land. No token, secret, or tenant ID is
// ever visible here or stored client-side — everything OAuth-related lives
// behind the xero-oauth-start / xero-oauth-callback / xero-connection /
// xero-sync-invoices Edge Functions (see supabase/functions/), which are the
// only things that ever touch the locked-down xero_connection table.
export default function XeroConnectionPanel() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['xeroConnectionStatus'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('xero-connection', { body: { action: 'status' } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to check Xero connection status');
      return data;
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('xero-oauth-start', { body: { return_origin: window.location.origin } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to start Xero connection');
      return data;
    },
    onSuccess: (data) => {
      // A real top-level navigation, not a fetch — Xero's consent screen
      // can't be loaded any other way.
      window.location.href = data.authorize_url;
    },
    onError: (e) => toast.error(e.message || 'Failed to start Xero connection'),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('xero-connection', { body: { action: 'disconnect' } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to disconnect');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['xeroConnectionStatus'] });
      toast.success('Disconnected from Xero');
    },
    onError: (e) => toast.error(e.message || 'Failed to disconnect'),
  });

  const connected = status?.connected;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><RefreshCw className="w-5 h-5" /> Xero Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect Xero to pull authorised sales invoices in as draft dispatches you can review, allocate a real batch
          against, and approve — nothing here touches stock until you approve a dispatch. Configure which Xero line
          items map to which products under Xero Product Mapping. Once connected, use the "Sync Xero" button on the
          Dispatch page to pull in new invoices.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking connection…</p>
        ) : connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-medium">Connected{status.tenant_name ? ` to ${status.tenant_name}` : ''}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Last synced: {status.last_synced_at ? format(new Date(status.last_synced_at), 'd MMM yyyy, h:mm a') : 'Never'}
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
              <Unlink className="w-4 h-4" /> Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Not connected.</p>
            <Button size="sm" className="gap-1.5" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
              <Link2 className="w-4 h-4" /> {connectMutation.isPending ? 'Connecting…' : 'Connect to Xero'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
