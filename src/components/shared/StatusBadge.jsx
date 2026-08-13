import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusStyles = {
  planned: 'bg-muted text-muted-foreground',
  macerating: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  // Dispatch / order lifecycle
  pending: 'bg-amber-100 text-amber-800',
  picking: 'bg-blue-100 text-blue-800',
  ready: 'bg-indigo-100 text-indigo-800',
  dispatched: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-rose-100 text-rose-800',
  processing: 'bg-blue-100 text-blue-800',
};

export default function StatusBadge({ status }) {
  const label = status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
  return (
    <Badge variant="secondary" className={cn('text-xs font-medium', statusStyles[status])}>
      {label}
    </Badge>
  );
}