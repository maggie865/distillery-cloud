import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES } from '@/lib/pages';
import { Card } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

/**
 * Dashboard-style landing page for a nav group — a grid of clickable tiles,
 * one per page in that group, respecting the same per-page permission
 * gating the top nav already applies. Shared by Compliance.jsx and EMS.jsx
 * so both hubs stay visually/behaviorally identical as pages move between
 * them (e.g. Waste Tracker/Utilities relocating from Compliance to EMS).
 */
export default function NavGroupHub({ title, subtitle, navGroup, ownKey, descriptions = {} }) {
  const { user } = useAuth();
  const { canAccess } = usePagePermissions();
  const isSuperAdmin = user?.role === 'super_admin';

  const tiles = PAGES.filter((p) =>
    p.navGroup === navGroup &&
    p.key !== ownKey &&
    !p.superAdminOnly &&
    (isSuperAdmin || canAccess(p.key, user?.role))
  );

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((p) => (
          <Link key={p.key} to={p.path}>
            <Card className="p-4 h-full flex items-start gap-3 hover:shadow-md hover:border-primary/30 transition-all">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <p.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.label}</p>
                {descriptions[p.key] && (
                  <p className="text-xs text-muted-foreground mt-0.5">{descriptions[p.key]}</p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-2" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
