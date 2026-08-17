import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Save } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_DISTILLERY = '250 Ocean Beach Road, Bluff, New Zealand';
const DEFAULT_WAREHOUSE = '27 Pavillion Drive, Māngere, Auckland 2015, New Zealand';

export default function LocationSettings() {
  const qc = useQueryClient();
  const [distillery, setDistillery] = useState(DEFAULT_DISTILLERY);
  const [warehouse, setWarehouse] = useState(DEFAULT_WAREHOUSE);

  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 100),
  });

  const distillerySetting = settings.find(s => s.key === 'distillery_address');
  const warehouseSetting = settings.find(s => s.key === 'warehouse_address');

  useEffect(() => {
    if (distillerySetting?.value) setDistillery(distillerySetting.value);
    if (warehouseSetting?.value) setWarehouse(warehouseSetting.value);
  }, [distillerySetting?.value, warehouseSetting?.value]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (distillerySetting) {
        await base44.entities.AppSettings.update(distillerySetting.id, { value: distillery });
      } else {
        await base44.entities.AppSettings.create({ key: 'distillery_address', value: distillery });
      }
      if (warehouseSetting) {
        await base44.entities.AppSettings.update(warehouseSetting.id, { value: warehouse });
      } else {
        await base44.entities.AppSettings.create({ key: 'warehouse_address', value: warehouse });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Location settings saved');
    },
    onError: (e) => toast.error(e.message || 'Failed to save location settings'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Location Settings</CardTitle>
        <CardDescription>Origin addresses used for distance and CO2e calculations across dispatches and reports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Distillery / Origin Address</Label>
          <Input value={distillery} onChange={e => setDistillery(e.target.value)} placeholder={DEFAULT_DISTILLERY} className="mt-1" />
          <p className="text-xs text-muted-foreground mt-1">Used as the origin for Bluff dispatches.</p>
        </div>
        <div>
          <Label>Auckland 3PL Warehouse Address</Label>
          <Input value={warehouse} onChange={e => setWarehouse(e.target.value)} placeholder={DEFAULT_WAREHOUSE} className="mt-1" />
          <p className="text-xs text-muted-foreground mt-1">Used as the origin for Auckland 3PL dispatches.</p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          {saveMutation.isPending ? 'Saving…' : <><Save className="w-4 h-4" /> Save Locations</>}
        </Button>
      </CardContent>
    </Card>
  );
}