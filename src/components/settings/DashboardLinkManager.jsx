import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

// All available nav pages
const ALL_PAGES = [
  { label: 'Dashboard', path: '/', icon: 'LayoutDashboard' },
  { label: 'Receiving', path: '/receiving', icon: 'PackageOpen' },
  { label: 'Distillation', path: '/distillation', icon: 'Flame' },
  { label: 'Dilutions', path: '/dilutions', icon: 'Droplets' },
  { label: 'Bottling Floor', path: '/bottling-floor', icon: 'Factory' },
  { label: 'Inventory', path: '/inventory', icon: 'Boxes' },
  { label: 'Tanks', path: '/tanks', icon: 'Cylinder' },
  { label: 'Dispatch Hub', path: '/dispatch', icon: 'Truck' },
  { label: 'Customers', path: '/customers', icon: 'Users' },
  { label: 'Suppliers', path: '/suppliers', icon: 'Building2' },
  { label: 'SNS Distillation', path: '/sns-distillation', icon: 'FlaskConical' },
  { label: 'Stock Takes', path: '/stock-takes', icon: 'ClipboardList' },
  { label: 'Food Recall', path: '/food-recall', icon: 'ShieldAlert' },
  { label: 'Maintenance', path: '/maintenance', icon: 'Wrench' },
  { label: 'Pest Control', path: '/pest-control', icon: 'Bug' },
  { label: 'Temperature Logs', path: '/temperature-logs', icon: 'Thermometer' },
  { label: 'Reports', path: '/reports', icon: 'BarChart3' },
  { label: 'Settings', path: '/settings', icon: 'Settings' },
];

export default function DashboardLinkManager() {
  const navigate = useNavigate();
  const [selectedPath, setSelectedPath] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customPath, setCustomPath] = useState('');

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['dashboardLinks'],
    queryFn: () => base44.entities.DashboardLink.list('sort_order', 50),
  });

  const handleAdd = async () => {
    const page = ALL_PAGES.find(p => p.path === selectedPath);
    const label = customLabel.trim() || page?.label;
    const path = customPath.trim() || page?.path;
    const icon = page?.icon || 'LayoutDashboard';
    if (!label || !path) {
      toast.error('Please select a page or fill in label and path');
      return;
    }
    const sortOrder = links.length;
    try {
      await base44.entities.DashboardLink.create({ label, path, icon, sort_order: sortOrder });
      toast.success('Quick link added');
      setSelectedPath('');
      setCustomLabel('');
      setCustomPath('');
    } catch (e) {
      toast.error(e.message || 'Failed to add quick link');
    }
  };

  const handleRemove = async (id) => {
    try {
      await base44.entities.DashboardLink.delete(id);
      toast.success('Quick link removed');
    } catch (e) {
      toast.error(e.message || 'Failed to remove quick link');
    }
  };

  const handleNavigate = (path) => {
    navigate(path);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard Quick Links</CardTitle>
        <CardDescription>
          Choose which pages appear as quick-link buttons on your Dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new link */}
        <div className="space-y-3">
          <Label>Add from existing pages</Label>
          <Select value={selectedPath} onValueChange={setSelectedPath}>
            <SelectTrigger>
              <SelectValue placeholder="Select a page…" />
            </SelectTrigger>
            <SelectContent>
              {ALL_PAGES.map(p => (
                <SelectItem key={p.path} value={p.path} disabled={links.some(l => l.path === p.path)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="text-xs text-muted-foreground text-center">— or —</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Custom Label</Label>
              <Input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="e.g. My Reports" />
            </div>
            <div>
              <Label className="text-xs">Custom Path</Label>
              <Input value={customPath} onChange={e => setCustomPath(e.target.value)} placeholder="/reports" />
            </div>
          </div>

          <Button onClick={handleAdd} className="w-full gap-2">
            <Plus className="w-4 h-4" /> Add Quick Link
          </Button>
        </div>

        {/* Existing links */}
        <div>
          <Label className="mb-2 block">Current quick links ({links.length})</Label>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quick links yet — add some above.</p>
          ) : (
            <div className="space-y-2">
              {links.map(link => (
                <div key={link.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5 bg-muted/30">
                  <GripVertical className="w-4 h-4 text-muted-foreground/40" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{link.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{link.path}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemove(link.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}