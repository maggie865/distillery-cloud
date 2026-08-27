import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Package, Warehouse, Cylinder, ChevronRight } from 'lucide-react';

export default function StockOverview() {
  const navigate = useNavigate();

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('-created_at', 5000),
  });
  const { data: warehouseStock = [] } = useQuery({
    queryKey: ['warehouseStock'],
    queryFn: () => base44.entities.WarehouseStock.list('-created_at', 5000),
  });
  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => base44.entities.StorageTank.list('name', 5000),
  });

  const distilleryBottles = finishedGoods.reduce((s, f) => s + (f.quantity_bottles || 0), 0);
  const warehouseBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
  const activeTanks = tanks.filter(t => (t.current_volume || 0) > 0 || t.status === 'in_use');

  const cards = [
    {
      label: 'Distillery Stock',
      value: distilleryBottles.toLocaleString(),
      sub: 'bottles (Bluff)',
      icon: Package,
      path: '/dispatch',
    },
    {
      label: '3PL Warehouse',
      value: warehouseBottles.toLocaleString(),
      sub: 'bottles (Auckland)',
      icon: Warehouse,
      path: '/dispatch',
    },
    {
      label: 'Tanks with Product',
      value: activeTanks.length,
      sub: `${tanks.length} total tanks`,
      icon: Cylinder,
      path: '/tanks',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <button
            key={c.label}
            onClick={() => navigate(c.path)}
            className="text-left"
          >
            <Card className="p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group h-full">
              <div className="flex items-center justify-between mb-2">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold font-display text-foreground mt-0.5">{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.sub}</p>
            </Card>
          </button>
        );
      })}
    </div>
  );
}