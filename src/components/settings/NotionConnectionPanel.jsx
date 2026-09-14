import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookOpen, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const SETTING_KEY = 'notion_sops_database_id';

// The Notion integration token (NOTION_API_KEY) is never entered here or
// stored anywhere client-side — it's a Supabase Edge Function secret only
// (supabase secrets set NOTION_API_KEY=...), read exclusively by
// notion-list-sops / notion-get-page. This panel only manages the database
// ID (not sensitive — it's visible in the database's own Notion URL) and
// lets you test the connection.
export default function NotionConnectionPanel() {
  const qc = useQueryClient();
  const [databaseId, setDatabaseId] = useState('');
  const [testResult, setTestResult] = useState(null);

  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => db.AppSettings.list('key', 5000),
  });
  const setting = settings.find((s) => s.key === SETTING_KEY);

  useEffect(() => {
    if (setting?.value) setDatabaseId(setting.value);
  }, [setting?.value]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (setting) {
        await db.AppSettings.update(setting.id, { value: databaseId.trim() });
      } else {
        await db.AppSettings.create({ key: SETTING_KEY, value: databaseId.trim() });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Notion database ID saved');
    },
    onError: (e) => toast.error(e.message || 'Failed to save'),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('notion-list-sops', { body: { database_id: databaseId.trim() } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Connection failed');
      return data;
    },
    onSuccess: (data) => setTestResult({ ok: true, count: data.sops.length }),
    onError: (e) => setTestResult({ ok: false, message: e.message }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5" /> SOP Library (Notion)</CardTitle>
        <CardDescription>Staff read SOPs directly from your Notion database under the SOPs page — nothing is published publicly.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">One-time setup (done outside Congener):</p>
          <p>1. In Notion, go to <span className="font-mono">Settings → Connections → Develop or manage integrations</span> and create a new internal integration. Copy its token.</p>
          <p>2. Open your SOP database in Notion → "···" menu → Connections → add that integration.</p>
          <p>3. Have an admin set that token as a Supabase secret: <span className="font-mono">supabase secrets set NOTION_API_KEY=…</span> (never pasted here or stored in the app).</p>
          <p>4. Paste the database ID below — it's the 32-character ID in the database's Notion URL (the part before any "?v=").</p>
        </div>

        <div>
          <Label>Notion Database ID</Label>
          <Input value={databaseId} onChange={(e) => setDatabaseId(e.target.value)} placeholder="e.g. a1b2c3d4e5f6…" className="mt-1 font-mono text-sm" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !databaseId.trim()} className="gap-2">
            {saveMutation.isPending ? 'Saving…' : <><Save className="w-4 h-4" /> Save</>}
          </Button>
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !databaseId.trim()} className="gap-2">
            {testMutation.isPending ? 'Testing…' : 'Test Connection'}
          </Button>
        </div>

        {testResult && (
          testResult.ok ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Connected — found {testResult.count} SOP{testResult.count !== 1 ? 's' : ''}.
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{testResult.message}</span>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
