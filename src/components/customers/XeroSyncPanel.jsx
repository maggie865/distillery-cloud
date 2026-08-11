import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw, Upload, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

/**
 * Xero is not connected in this environment — there's no OAuth app, no
 * stored tokens, and no Edge Function that actually talks to Xero's API.
 * Rather than fabricate a "synced" state or invented contact data, this
 * panel honestly reports that nothing is connected, and points at the CSV
 * importer (Settings > Inventory > Import Data > Customers) as the real,
 * working way to bring contacts in today. xero_contact_id already exists
 * on the customer table and "Sync now" still attempts a real call first,
 * so a genuine Xero connection can be wired in later without any further
 * schema or UI changes here.
 */
export default function XeroSyncPanel() {
  const navigate = useNavigate();
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
            {lastSyncedSetting ? `Last synced: ${format(new Date(lastSyncedSetting), 'd MMM yyyy \'at\' HH:mm')}` : 'No live connection yet — import a Xero CSV export instead, or connect a Xero account to sync automatically.'}
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/settings')}>
          <Upload className="w-3.5 h-3.5" /> Import CSV
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={checking} onClick={() => attemptSync('syncCustomersFromXero')}>
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} /> Sync now
        </Button>
      </div>
    </div>
  );
}
