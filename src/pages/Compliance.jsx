import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES } from '@/lib/pages';
import { Card } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// One-line description for each Compliance-group page, shown on its tile
// below. Keyed by page_key so a page can be added/removed from the group in
// pages.js without this file needing a matching structural change — an
// entry just silently gets no description if one hasn't been added here.
const DESCRIPTIONS = {
  'checklists': "Team task lists and the bottle washer's pre-use check",
  'temperature-logs': 'Fridge/freezer temperature readings and out-of-range alerts',
  'maintenance': 'Monthly inspections and annual safety certifications',
  'pest-control': 'Bait station checks and pest activity records',
  'food-recall': 'Recall register and traceability records',
  'waste-tracker': 'Waste volumes and disposal records',
  'utilities': 'Power, water, and gas usage tracking',
};

export default function Compliance() {
  const { user } = useAuth();
  const { canAccess } = usePagePermissions();
  const isSuperAdmin = user?.role === 'super_admin';

  const tiles = PAGES.filter((p) =>
    p.navGroup === 'Compliance' &&
    p.key !== 'compliance' &&
    !p.superAdminOnly &&
    (isSuperAdmin || canAccess(p.key, user?.role))
  );

  return (
    <div>
      <PageHeader title="Compliance" subtitle="Checklists, inspections, and regulatory records" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((p) => (
          <Link key={p.key} to={p.path}>
            <Card className="p-4 h-full flex items-start gap-3 hover:shadow-md hover:border-primary/30 transition-all">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <p.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.label}</p>
                {DESCRIPTIONS[p.key] && (
                  <p className="text-xs text-muted-foreground mt-0.5">{DESCRIPTIONS[p.key]}</p>
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
