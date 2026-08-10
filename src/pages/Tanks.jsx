import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';
import TankFarmGrid from '@/components/tanks/TankFarmGrid';
import Pagination from '@/components/ui/Pagination';

const ACTION_LABELS = {
  fill: 'Fill',
  empty: 'Empty',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  bottling_draw: 'Bottling Draw',
  cleaning: 'Cleaning',
};

const ACTION_COLORS = {
  fill: 'bg-emerald-100 text-emerald-800',
  empty: 'bg-red-100 text-red-700',
  transfer_in: 'bg-blue-100 text-blue-800',
  transfer_out: 'bg-amber-100 text-amber-800',
  bottling_draw: 'bg-purple-100 text-purple-800',
  cleaning: 'bg-muted text-muted-foreground',
};

export default function Tanks() {
  const [mvmtPage, setMvmtPage] = useState(1);
  const [mvmtPageSize, setMvmtPageSize] = useState(50);

  const { data: movements = [], isLoading: movLoading } = useQuery({
    queryKey: ['tankMovements'],
    queryFn: () => db.TankMovement.list('-date', 5000),
  });

  const pagedMovements = movements.slice((mvmtPage - 1) * mvmtPageSize, mvmtPage * mvmtPageSize);

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Tank Farm" subtitle="Live view of all storage tanks and their contents" />

      <Tabs defaultValue="tanks">
        <TabsList className="mb-6">
          <TabsTrigger value="tanks">Tank Farm</TabsTrigger>
          <TabsTrigger value="history">Movement History</TabsTrigger>
        </TabsList>

        <TabsContent value="tanks">
          <TankFarmGrid />
        </TabsContent>

        <TabsContent value="history">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Tank</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Volume (L)</TableHead>
                    <TableHead>ABV</TableHead>
                    <TableHead>LALs</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Ethanol Lot</TableHead>
                    <TableHead>Botanical Lot</TableHead>
                    <TableHead>Operator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movLoading ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : movements.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No movements recorded yet</TableCell></TableRow>
                  ) : pagedMovements.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm whitespace-nowrap">{m.date ? format(new Date(m.date), 'MMM d, yyyy') : '—'}</TableCell>
                      <TableCell className="font-semibold text-sm">Tank {m.tank_name}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${ACTION_COLORS[m.action] || ''}`} variant="secondary">
                          {ACTION_LABELS[m.action] || m.action}
                          {m.counterpart_tank && ` ↔ ${m.counterpart_tank}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.volume_litres}</TableCell>
                      <TableCell className="text-sm">{m.abv ? `${m.abv}%` : '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{m.lals?.toFixed(3) || '—'}</TableCell>
                      <TableCell className="text-sm">{m.product || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{m.batch_number || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{m.ethanol_lot || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{m.botanical_lot || '—'}</TableCell>
                      <TableCell className="text-sm">{m.operator || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination total={movements.length} page={mvmtPage} pageSize={mvmtPageSize} onPageChange={setMvmtPage} onPageSizeChange={(s) => { setMvmtPageSize(s); setMvmtPage(1); }} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
