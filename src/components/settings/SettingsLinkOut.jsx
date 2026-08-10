import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

// For settings items whose real functionality already lives on its own
// operational page (Suppliers, Maintenance, Inventory thresholds, User
// permissions) rather than being worth re-embedding inside Settings.
export default function SettingsLinkOut({ label, description, path, icon: Icon }) {
  const navigate = useNavigate();
  return (
    <Card className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="flex-1">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Button onClick={() => navigate(path)} className="gap-2 shrink-0">
        Open {label} <ArrowRight className="w-4 h-4" />
      </Button>
    </Card>
  );
}
