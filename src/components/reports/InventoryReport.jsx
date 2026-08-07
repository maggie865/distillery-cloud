import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Package, Wine, Droplets, Boxes, Factory, FlaskConical } from 'lucide-react';
import StatCard from '@/components/shared/StatCard';

export default function InventoryReport({ rawMaterialsNetStock, finishedGoodsWithStock, warehouseStock, tanks }) {
  const ethanolItems = rawMaterialsNetStock.filter(m => m.type === 'ethanol');
  const botanicalItems = rawMaterialsNetStock.filter(m => m.type === 'botanical');
  const packagingItems = rawMaterialsNetStock.filter(m => m.type === 'packaging');
  const otherMaterials = rawMaterialsNetStock.filter(m => !['ethanol', 'botanical', 'packaging'].includes(m.type));
  const activeTanks = tanks.filter(t => t.status !== 'empty' && t.current_volume > 0);

  const totalEthanolLals = ethanolItems.reduce((s, m) => s + (m.lals || 0), 0);
  const totalEthanolLitres = ethanolItems.reduce((s, m) => s + (m.quantity || 0), 0);
  const totalBotanicalsQty = botanicalItems.length;
  const totalPackagingQty = packagingItems.reduce((s, m) => s + (m.quantity || 0), 0);
  const totalFinishedBottles = finishedGoodsWithStock.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
  const totalFinishedLals = finishedGoodsWithStock.reduce((s, g) => s + (g.total_lals || 0), 0);
  const total3PLBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
  const totalTankLitres = activeTanks.reduce((s, t) => s + (t.current_volume || 0), 0);
  const totalTankLals = activeTanks.reduce((s, t) => s + ((t.current_volume || 0) * (t.current_abv || 0) / 100), 0);

  const tankStatusColor = (status) => {
    if (status === 'in_use') return 'bg-blue-100 text-blue-700';
    if (status === 'cleaning') return 'bg-amber-100 text-amber-700';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Current Inventory (Live)</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Ethanol" value={totalEthanolLitres.toFixed(1)} sub={`${totalEthanolLals.toFixed(2)} LALs`} icon={FlaskConical} color="text-amber-600" bg="bg-amber-50 border-amber-200" />
        <StatCard label="Botanicals" value={botanicalItems.length} sub="raw materials" icon={Package} color="text-green-600" bg="bg-green-50 border-green-200" />
        <StatCard label="Packaging" value={packagingItems.length} sub="components" icon={Boxes} color="text-purple-600" bg="bg-purple-50 border-purple-200" />
        <StatCard label="Finished Goods" value={totalFinishedBottles.toLocaleString()} sub={`${totalFinishedLals.toFixed(2)} LALs`} icon={Wine} color="text-primary" bg="bg-accent border-accent-foreground/10" />
        <StatCard label="3PL Stock" value={total3PLBottles.toLocaleString()} sub="at Auckland 3PL" icon={Factory} color="text-blue-600" bg="bg-blue-50 border-blue-200" />
        <StatCard label="Tank Contents" value={totalTankLitres.toFixed(1)} sub={`${totalTankLals.toFixed(2)} LALs`} icon={Droplets} color="text-cyan-600" bg="bg-cyan-50 border-cyan-200" />
      </div>

      {/* Ethanol */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><FlaskConical className="w-4 h-4 text-amber-600" /> Ethanol Stock</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ABV %</TableHead>
                <TableHead>Volume (L)</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Batch/Lot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ethanolItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">No ethanol in stock</TableCell></TableRow>
              ) : ethanolItems.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium text-sm">{m.name}</TableCell>
                  <TableCell className="text-sm">{m.abv_percent ? `${m.abv_percent}%` : '—'}</TableCell>
                  <TableCell className="text-sm font-semibold">{(m.quantity || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-sm">{m.lals ? m.lals.toFixed(3) : '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.supplier || '—'}</TableCell>
                  <TableCell className="text-sm font-mono text-xs">{m.batch_number || '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold bg-amber-50/50">
                <TableCell colSpan={2}>Total Ethanol</TableCell>
                <TableCell className="text-sm">{totalEthanolLitres.toFixed(2)} L</TableCell>
                <TableCell className="text-sm">{totalEthanolLals.toFixed(3)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Botanicals / Raw Materials */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-green-600" /> Botanicals & Raw Materials</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Batch/Lot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {botanicalItems.length === 0 && otherMaterials.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">No raw materials in stock</TableCell></TableRow>
              ) : [...botanicalItems, ...otherMaterials].map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium text-sm">{m.name}</TableCell>
                  <TableCell className="text-sm capitalize">{m.type}</TableCell>
                  <TableCell className="text-sm font-semibold">{(m.quantity || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-sm">{m.unit}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.supplier || '—'}</TableCell>
                  <TableCell className="text-sm font-mono text-xs">{m.batch_number || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Packaging */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Boxes className="w-4 h-4 text-purple-600" /> Packaging Components</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Batch/Lot</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packagingItems.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-sm">No packaging in stock</TableCell></TableRow>
              ) : packagingItems.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium text-sm">{m.name}</TableCell>
                  <TableCell className="text-sm font-semibold">{(m.quantity || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{m.unit}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.supplier || '—'}</TableCell>
                  <TableCell className="text-sm font-mono text-xs">{m.batch_number || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Finished Goods */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Wine className="w-4 h-4 text-primary" /> Finished Goods (Distillery)</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Bottle Size</TableHead>
                <TableHead>Bottles</TableHead>
                <TableHead>ABV %</TableHead>
                <TableHead>LALs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finishedGoodsWithStock.filter(fg => fg.quantity_bottles > 0).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">No finished goods in stock</TableCell></TableRow>
              ) : finishedGoodsWithStock.filter(fg => fg.quantity_bottles > 0).map(fg => (
                <TableRow key={fg.id}>
                  <TableCell className="font-medium text-sm">{fg.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{fg.batch_number}</TableCell>
                  <TableCell className="text-sm">{fg.bottle_size_ml ? `${fg.bottle_size_ml}ml` : '—'}</TableCell>
                  <TableCell className="text-sm font-semibold">{(fg.quantity_bottles || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{fg.abv_percent ? `${fg.abv_percent}%` : '—'}</TableCell>
                  <TableCell className="text-sm">{fg.total_lals ? fg.total_lals.toFixed(3) : '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold bg-accent/20">
                <TableCell colSpan={3}>Total Finished Goods</TableCell>
                <TableCell className="text-sm">{totalFinishedBottles.toLocaleString()}</TableCell>
                <TableCell />
                <TableCell className="text-sm">{totalFinishedLals.toFixed(3)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Tank Contents */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Droplets className="w-4 h-4 text-cyan-600" /> Tank Contents</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tank</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Volume (L)</TableHead>
                <TableHead>ABV %</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tanks.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground text-sm">No tanks configured</TableCell></TableRow>
              ) : tanks.map(t => {
                const lals = (t.current_volume || 0) * (t.current_abv || 0) / 100;
                return (
                  <TableRow key={t.id} className={t.status === 'empty' ? 'opacity-40' : ''}>
                    <TableCell className="font-medium text-sm">{t.name}</TableCell>
                    <TableCell className="text-sm">{t.current_product || '—'}</TableCell>
                    <TableCell className="text-sm font-mono text-xs">{t.current_batch || '—'}</TableCell>
                    <TableCell className="text-sm font-semibold">{(t.current_volume || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{t.current_abv ? `${t.current_abv}%` : '—'}</TableCell>
                    <TableCell className="text-sm">{lals > 0 ? lals.toFixed(3) : '—'}</TableCell>
                    <TableCell><Badge className={tankStatusColor(t.status)} variant="secondary">{t.status}</Badge></TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-semibold bg-cyan-50/50">
                <TableCell colSpan={3}>Total in Tanks</TableCell>
                <TableCell className="text-sm">{totalTankLitres.toFixed(2)} L</TableCell>
                <TableCell />
                <TableCell className="text-sm">{totalTankLals.toFixed(3)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}