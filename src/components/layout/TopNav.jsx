import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES, NAV_GROUPS } from '@/lib/pages';

// Fades the edges of a horizontally-scrollable row so cut-off content reads
// as "more to scroll" rather than just ending abruptly - most useful on
// mobile, where the whole row rarely fits.
const scrollFadeStyle = {
  maskImage: 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
  WebkitMaskImage: 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
};

/**
 * Two-tier sticky top nav. Row 1 has the top-level pages plus a button per
 * group; clicking a group opens row 2 underneath it showing that group's
 * pages. Row 2 tracks the current route by default (so navigating within a
 * group keeps it open and always shows where you are), but clicking a
 * different group previews it without navigating - see `activeGroup` below.
 *
 * Both rows scroll horizontally on narrow screens, so whichever item is
 * "active" is auto-scrolled into view on every navigation/group change -
 * otherwise the current page could end up scrolled off-screen with nothing
 * indicating it, which defeats the point of a nav meant to show you where
 * you are.
 */
export default function TopNav() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { canAccess } = usePagePermissions();
  const isSuperAdmin = user?.role === 'super_admin';

  const visible = (p) => !p.superAdminOnly && (isSuperAdmin || canAccess(p.key, user?.role));

  const topPages = PAGES.filter((p) => p.navGroup === 'top' && visible(p));
  const bottomPages = PAGES.filter((p) => p.navGroup === 'bottom' && (visible(p) || (p.superAdminOnly && isSuperAdmin)));
  const groups = NAV_GROUPS
    .map((name) => {
      const items = PAGES.filter((p) => p.navGroup === name && visible(p));
      return { name, items, hub: items.find((p) => p.isHub) || null };
    })
    .filter((g) => g.items.length > 0);

  const currentPage = PAGES.find((p) => p.path === location.pathname);
  const routeGroup = groups.some((g) => g.name === currentPage?.navGroup) ? currentPage.navGroup : null;

  const [manualGroup, setManualGroup] = useState(null);
  useEffect(() => setManualGroup(null), [location.pathname]);

  const activeGroup = manualGroup ?? routeGroup;
  const activeGroupEntry = groups.find((g) => g.name === activeGroup);
  const activeGroupPages = activeGroupEntry?.items || [];
  const activeGroupHasHub = !!activeGroupEntry?.hub;

  const toggleGroup = (name) => setManualGroup(name === activeGroup ? null : name);

  const row1Ref = useRef(null);
  const row2Ref = useRef(null);

  useEffect(() => {
    for (const ref of [row1Ref, row2Ref]) {
      const active = ref.current?.querySelector('[data-active="true"]');
      active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [location.pathname, activeGroup]);

  const navLinkClass = (isActive) => cn(
    "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150",
    isActive
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-foreground hover:bg-muted"
  );

  return (
    <div className="sticky top-0 z-40 bg-card/85 backdrop-blur-md border-b border-border shadow-sm">
      {/* Row 1: brand, top-level pages, groups, user menu */}
      <div ref={row1Ref} className="flex items-center gap-1 px-3 md:px-6 h-16 overflow-x-auto" style={scrollFadeStyle}>
        <Link to="/" className="font-display font-bold text-primary shrink-0 mr-2 whitespace-nowrap">
          Distillery OS
        </Link>

        {topPages.map((p) => (
          <Link
            key={p.key}
            to={p.path}
            data-active={location.pathname === p.path}
            className={navLinkClass(location.pathname === p.path)}
          >
            {p.label}
          </Link>
        ))}

        {groups.map((group) => group.hub ? (
          // A group with a hub page (Production/Inventory/Compliance/EMS)
          // relies on HubSidebar for in-group navigation instead of row 2 -
          // link straight to the hub rather than toggling open a row 2 that
          // would just duplicate the sidebar.
          <Link
            key={group.name}
            to={group.hub.path}
            data-active={location.pathname === group.hub.path}
            className={navLinkClass(location.pathname === group.hub.path)}
          >
            {group.name}
          </Link>
        ) : (
          <button
            key={group.name}
            data-active={activeGroup === group.name}
            onClick={() => toggleGroup(group.name)}
            className={cn(navLinkClass(activeGroup === group.name), "flex items-center gap-1")}
          >
            {group.name}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", activeGroup === group.name && "rotate-180")} />
          </button>
        ))}

        {bottomPages.map((p) => (
          <Link
            key={p.key}
            to={p.path}
            data-active={location.pathname === p.path}
            className={navLinkClass(location.pathname === p.path)}
          >
            {p.label}
          </Link>
        ))}

        <div className="flex-1" />

        <div className="flex items-center gap-2 shrink-0 pl-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">
              {(user?.email || '?')[0].toUpperCase()}
            </span>
          </div>
          <div className="hidden md:block leading-tight">
            <p className="text-xs font-medium text-foreground truncate max-w-[160px]">{user?.email}</p>
            <p className="text-[10px] text-muted-foreground">{user?.role}</p>
          </div>
          <button
            onClick={() => logout()}
            title="Log out"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Row 2: current group's pages - stays visible while inside the group.
          Skipped for groups with a hub page (row 1 links straight there,
          and HubSidebar takes over in-group navigation from here). */}
      {activeGroup && !activeGroupHasHub && (
        <div ref={row2Ref} className="flex items-center gap-1 px-3 md:px-6 h-11 border-t border-border overflow-x-auto bg-muted/40" style={scrollFadeStyle}>
          {activeGroupPages.map((p) => {
            const isActive = location.pathname === p.path;
            return (
              <Link
                key={p.key}
                to={p.path}
                data-active={isActive}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-foreground hover:bg-background"
                )}
              >
                <p.icon className="w-3.5 h-3.5 shrink-0" />
                {p.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
