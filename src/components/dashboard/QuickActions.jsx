import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Flame, PackagePlus, ArrowLeftRight, Truck, Martini, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import TastingDispatchDialog from './TastingDispatchDialog';
import NewCustomerVisitDialog from './NewCustomerVisitDialog';

const ACTIONS = [
  { label: 'New Distillation', path: '/distillation', icon: Flame, tone: 'bg-warning/10 text-warning' },
  { label: 'Receive Inventory', path: '/receiving', icon: PackagePlus, tone: 'bg-success/10 text-success' },
  { label: 'Transfer Stock', path: '/tanks', icon: ArrowLeftRight, tone: 'bg-info/10 text-info' },
  { label: 'Dispatch Order', path: '/dispatch', icon: Truck, tone: 'bg-primary/10 text-primary' },
];

export default function QuickActions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canAccess } = usePagePermissions();
  const [tastingOpen, setTastingOpen] = useState(false);
  const [newCustomerVisitOpen, setNewCustomerVisitOpen] = useState(false);

  // Same access check as the Dispatch page itself - visible only to
  // whoever could actually open Dispatch and see the pending row this
  // creates.
  const canDispatch = user?.role === 'super_admin' || canAccess('dispatch', user?.role);
  // Same access check as the Customers page - visible only to whoever
  // could actually open Customers and see the record this creates.
  const canManageCustomers = user?.role === 'super_admin' || canAccess('customers', user?.role);

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
        {canDispatch && (
          <button onClick={() => setTastingOpen(true)} className="text-left">
            <Card className="p-4 flex flex-col items-center text-center gap-2.5 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className="w-11 h-11 rounded-full flex items-center justify-center bg-accent text-accent-foreground">
                <Martini className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-foreground leading-tight">Tasting / Promo Dispatch</span>
            </Card>
          </button>
        )}
        {canManageCustomers && (
          <button onClick={() => setNewCustomerVisitOpen(true)} className="text-left">
            <Card className="p-4 flex flex-col items-center text-center gap-2.5 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className="w-11 h-11 rounded-full flex items-center justify-center bg-secondary text-secondary-foreground">
                <UserPlus className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-foreground leading-tight">Log New Customer Visit</span>
            </Card>
          </button>
        )}
      </div>

      <TastingDispatchDialog open={tastingOpen} onClose={() => setTastingOpen(false)} />
      <NewCustomerVisitDialog open={newCustomerVisitOpen} onClose={() => setNewCustomerVisitOpen(false)} />
    </div>
  );
}
