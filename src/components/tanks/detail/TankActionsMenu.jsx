import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Presentational "More" menu — the caller decides which actions are
 * appropriate for the tank's current state and passes only those in.
 * `actions` is an array of { key, label, icon, onClick, destructive?,
 * separatorBefore? }.
 */
export default function TankActionsMenu({ actions }) {
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <MoreHorizontal className="w-4 h-4" /> More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {actions.map((a) => (
          <div key={a.key}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={a.onClick}
              className={cn('gap-2', a.destructive && 'text-destructive focus:text-destructive')}
            >
              <a.icon className="w-4 h-4" /> {a.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
