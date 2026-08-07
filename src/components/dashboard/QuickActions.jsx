import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Flame, PackagePlus, ArrowLeftRight, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIONS = [
  { label: 'New Distillation', path: '/distillation', icon: Flame, tone: 'bg-warning/10 text-warning' },
  { label: 'Receive Inventory', path: '/receiving', icon: PackagePlus, tone: 'bg-success/10 text-success' },
  { label: 'Transfer Stock', path: '/tanks', icon: ArrowLeftRight, tone: 'bg-info/10 text-info' },
  { label: 'Dispatch Order', path: '/dispatch', icon: Truck, tone: 'bg-primary/10 text-primary' },
];

export default function QuickActions() {
  const navigate = useNavigate();
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {ACTIONS.map((a) => (
          <button key={a.path} onClick={() => navigate(a.path)} className="text-left">
            <Card className="p-4 flex flex-col items-center text-center gap-2.5 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className={cn('w-11 h-11 rounded-full flex items-center justify-center', a.tone)}>
                <a.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-foreground leading-tight">{a.label}</span>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
