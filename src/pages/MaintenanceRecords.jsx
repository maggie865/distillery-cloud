import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarCheck, ShieldCheck } from 'lucide-react';
import MonthlyChecksTab from '@/components/maintenance/MonthlyChecksTab';
import YearlyChecksTab from '@/components/maintenance/YearlyChecksTab';
import LegacyRecords from '@/components/maintenance/LegacyRecords';

const LEGACY_TYPES = ['scheduled', 'repair', 'calibration', 'cleaning', 'inspection'];
const ACTIVE_TYPES = ['pre_use_check', 'monthly_check', 'yearly_check', 'fire_extinguisher_service'];

export default function MaintenanceRecords() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: records = [] } = useQuery({
    queryKey: ['maintenanceRecords'],
    queryFn: () => base44.entities.MaintenanceRecord.list('-date', 5000),
  });

  const createRecords = async (recordsList) => {
    setSaving(true);
    try {
      for (const data of recordsList) {
        await base44.entities.MaintenanceRecord.create(data);
      }
      await queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
    } finally {
      setSaving(false);
    }
  };

  const legacyRecords = records.filter(r => !r.maintenance_type || LEGACY_TYPES.includes(r.maintenance_type));

  const updateRecord = async (id, payload) => {
    await base44.entities.MaintenanceRecord.update(id, payload);
    await queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Maintenance</h1>
        <p className="text-sm text-muted-foreground">Monthly inspections and annual safety certifications</p>
        <p className="text-xs text-muted-foreground">Looking for the bottle washer's pre-use check? That's moved to Daily Checks.</p>
      </div>

      <Tabs defaultValue="monthly">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="monthly" className="gap-1.5"><CalendarCheck className="w-4 h-4" /> Monthly Checks</TabsTrigger>
          <TabsTrigger value="yearly" className="gap-1.5"><ShieldCheck className="w-4 h-4" /> Yearly Safety</TabsTrigger>
        </TabsList>
        <TabsContent value="monthly" className="mt-4">
          <MonthlyChecksTab records={records} onCreate={createRecords} saving={saving} />
        </TabsContent>
        <TabsContent value="yearly" className="mt-4">
          <YearlyChecksTab records={records} onCreate={createRecords} onUpdate={updateRecord} saving={saving} />
        </TabsContent>
      </Tabs>

      <LegacyRecords records={legacyRecords} />
    </div>
  );
}