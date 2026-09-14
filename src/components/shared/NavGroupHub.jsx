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
 *
 * `sections`, when passed, is an ordered list of `{ label, keys }` used to
 * split the tile grid into labeled subsections (e.g. "Daily/Routine" vs
 * "Registers & Reporting") instead of one undifferentiated grid — mirrors
 * the same grouping BottomNav.jsx applies to its "More" drawer. Any tile
 * whose key isn't listed in any section (a page added later and not yet
 * sorted) falls into a trailing "Other" section rather than disappearing.
 */
export default function NavGroupHub({ title, subtitle, navGroup, ownKey, descriptions = {}, sections }) {
  const { user } = useAuth();
  const { canAccess } = usePagePermissions();
  const isSuperAdmin = user?.role === 'super_admin';

  const tiles = PAGES.filter((p) =>
    p.navGroup === navGroup &&
    p.key !== ownKey &&
    !p.superAdminOnly &&
    (isSuperAdmin || canAccess(p.key, user?.role))
  );

  const renderTile = (p) => (
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
  );

  let groupedTiles = null;
  if (sections) {
    const used = new Set();
    groupedTiles = sections.map(({ label, keys }) => ({
      label,
      pages: keys.map((k) => tiles.find((p) => p.key === k)).filter((p) => { if (p) used.add(p.key); return !!p; }),
    }));
    const leftover = tiles.filter((p) => !used.has(p.key));
    if (leftover.length > 0) groupedTiles.push({ label: 'Other', pages: leftover });
    groupedTiles = groupedTiles.filter((g) => g.pages.length > 0);
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      {groupedTiles ? (
        <div className="space-y-6">
          {groupedTiles.map((g) => (
            <div key={g.label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{g.label}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.pages.map(renderTile)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map(renderTile)}
        </div>
      )}
    </div>
  );
}
