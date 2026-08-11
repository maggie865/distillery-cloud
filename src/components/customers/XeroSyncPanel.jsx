import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

/**
 * Xero is not connected in this environment — there's no OAuth app, no
 * stored tokens, and no Edge Function that actually talks to Xero's API.
 * Rather than fabricate a "synced" state or invented contact data, this
 * panel honestly reports that nothing is connected. xero_contact_id already
 * exists on the customer table (and Import/Sync both attempt a real call
 * first) so a genuine Xero connection can be wired in later without any
 * further schema or UI changes here.
 */
export default function XeroSyncPanel() {
  const [checking, setChecking] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 100),
  });
  const lastSyncedSetting = settings.find((s) => s.key === 'xero_last_synced')?.value || null;

  const attemptSync = async (action) => {
    setChecking(true);
    try {
      await base44.functions.invoke(action, {});
      toast.success('Sync complete');
    } catch {
      toast.error('Xero is not connected — connect a Xero account before importing or syncing customers.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Xero is not connected</p>
          <p className="text-xs text-muted-foreground">
            {lastSyncedSetting ? `Last synced: ${format(new Date(lastSyncedSetting), 'd MMM yyyy \'at\' HH:mm')}` : 'Connect a Xero account to import and sync customers.'}
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" size="sm" className="gap-1.5" disabled={checking} onClick={() => attemptSync('importCustomersFromXero')}>
          <Download className="w-3.5 h-3.5" /> Import from Xero
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={checking} onClick={() => attemptSync('syncCustomersFromXero')}>
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} /> Sync now
        </Button>
      </div>
    </div>
  );
}
