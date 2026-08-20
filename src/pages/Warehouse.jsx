import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StockTab from '@/components/warehouse/StockTab';
import TransfersTab from '@/components/warehouse/TransfersTab';
import PackingSlipsTab from '@/components/warehouse/PackingSlipsTab';
import { printPackingSlip, formatPackingSlipNumber } from '@/lib/packingSlip';

export default function Warehouse() {
  const qc = useQueryClient();
  const [location, setLocation] = useState('Auckland 3PL');

  const { data: warehouseStock = [] } = useQuery({
    queryKey: ['warehouseStock'],
    queryFn: () => base44.entities.WarehouseStock.list('-transfer_date', 5000),
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => base44.entities.Dispatch.list('-dispatch_date', 5000),
  });

  // Filter stock by selected warehouse location.
  // Records without a warehouse_location default to Auckland 3PL (the original site).
  const locationStock = warehouseStock.filter(w => (w.warehouse_location || 'Auckland 3PL') === location);

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('-created_date', 5000),
  });

  const getSetting = (key) => {
    const s = appSettings.find(s => s.key === key);
    return s?.value || '';
  };

  const handlePrintPackingSlip = async (slipNumberOrRecord) => {
    try {
      let packingSlipNumber;
      if (typeof slipNumberOrRecord === 'string') {
        packingSlipNumber = slipNumberOrRecord;
      } else {
        packingSlipNumber = slipNumberOrRecord.packing_slip_number;
        if (!packingSlipNumber) {
          const allSettings = await base44.entities.AppSettings.list('-created_date', 5000);
          const lastNumSetting = allSettings.find(s => s.key === 'last_packing_slip_number');
          const lastNum = lastNumSetting ? parseInt(lastNumSetting.value) || 0 : 0;
          const newNum = lastNum + 1;
          const year = new Date().getFullYear();
          packingSlipNumber = formatPackingSlipNumber(newNum, year);

          await base44.entities.WarehouseStock.update(slipNumberOrRecord.id, { packing_slip_number: packingSlipNumber });

          if (lastNumSetting) {
            await base44.entities.AppSettings.update(lastNumSetting.id, { value: String(newNum) });
          } else {
            await base44.entities.AppSettings.create({ key: 'last_packing_slip_number', value: String(newNum) });
          }

          qc.invalidateQueries({ queryKey: ['warehouseStock'] });
        }
      }

      const allStock = await base44.entities.WarehouseStock.list('-transfer_date', 5000);
      const slipRecords = allStock.filter(w => w.packing_slip_number === packingSlipNumber);

      if (slipRecords.length === 0) {
        toast.error('No records found for packing slip ' + packingSlipNumber);
        return;
      }

      const transferDate = slipRecords[0].transfer_date || slipRecords[0].date_transferred_in;

      printPackingSlip({
        packingSlipNumber,
        transferDate,
        printDate: new Date().toISOString().split('T')[0],
        companyName: getSetting('company_name'),
        fromAddress: getSetting('distillery_address'),
        toAddress: getSetting('warehouse_address'),
        lines: slipRecords.map(w => ({
          product_name: w.product_name,
          batch_number: w.batch_number,
          bottle_size_ml: w.bottle_size_ml,
          quantity_bottles: w.quantity_bottles,
          total_lals: w.total_lals,
          abv_percent: w.abv_percent,
        })),
      });
    } catch (err) {
      toast.error('Failed to print packing slip: ' + err.message);
    }
  };

  const handleAdjustStock = async (record, qty, lals, reason) => {
    try {
      const noteText = `[Adjusted ${new Date().toISOString().split('T')[0]}] ${reason || 'Manual reconciliation'} — qty: ${record.quantity_bottles}\u2192${qty}, lals: ${record.total_lals}\u2192${lals}`;
      const existingNotes = record.notes ? record.notes + '\n' : '';
      await base44.entities.WarehouseStock.update(record.id, {
        quantity_bottles: qty,
        total_lals: parseFloat(lals.toFixed(4)),
        notes: existingNotes + noteText,
      });
      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      toast.success('Stock adjusted');
    } catch (err) {
      toast.error('Failed to adjust stock: ' + err.message);
    }
  };

  const handleDeleteStock = async (record) => {
    if (!confirm('This will remove this stock record. Are you sure?')) return;

    try {
      const allFG = await base44.entities.FinishedGood.list('-created_date', 5000);
      const fg = allFG.find(f =>
        f.product_name === record.product_name &&
        f.batch_number === record.batch_number &&
        Number(f.bottle_size_ml) === Number(record.bottle_size_ml)
      );

      if (!fg) {
        toast.error('No matching Finished Good found to return stock to. Delete aborted.');
        return;
      }

      await base44.entities.FinishedGood.update(fg.id, {
        quantity_bottles: (fg.quantity_bottles || 0) + (record.quantity_bottles || 0),
        total_lals: parseFloat(((fg.total_lals || 0) + (record.total_lals || 0)).toFixed(4)),
      });

      await base44.entities.WarehouseStock.delete(record.id);

      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      toast.success('Stock record deleted and quantity returned to finished goods');
    } catch (err) {
      toast.error('Failed to delete stock: ' + err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={location === 'UK Bonded' ? 'Warehouse (UK Bonded)' : 'Warehouse (Auckland 3PL)'}
        subtitle={location === 'UK Bonded'
          ? 'Stock held under bond in the UK — no NZ excise reporting'
          : 'Stock, transfers and packing slips for Auckland 3PL warehouse'}
      >
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setLocation('Auckland 3PL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${location === 'Auckland 3PL' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            Auckland 3PL
          </button>
          <button
            onClick={() => setLocation('UK Bonded')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${location === 'UK Bonded' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            UK Bonded
          </button>
        </div>
      </PageHeader>

      <Tabs defaultValue="stock">
        <TabsList className="mb-5">
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="slips">Packing Slips</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <StockTab warehouseStock={locationStock} dispatches={dispatches} onPrintSlip={handlePrintPackingSlip} onAdjust={handleAdjustStock} onDelete={handleDeleteStock} />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTab warehouseStock={locationStock} onPrintSlip={handlePrintPackingSlip} />
        </TabsContent>
        <TabsContent value="slips">
          <PackingSlipsTab warehouseStock={locationStock} onPrintSlip={handlePrintPackingSlip} />
        </TabsContent>
      </Tabs>
    </div>
  );
}