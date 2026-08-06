import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES, NAV_GROUPS } from '@/lib/pages';

/**
 * Two-tier sticky top nav. Row 1 has the top-level pages plus a button per
 * group; clicking a group opens row 2 underneath it showing that group's
 * pages. Row 2 tracks the current route by default (so navigating within a
 * group keeps it open and always shows where you are), but clicking a
 * different group previews it without navigating - see `activeGroup` below.
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
    .map((name) => ({ name, items: PAGES.filter((p) => p.navGroup === name && visible(p)) }))
    .filter((g) => g.items.length > 0);

  const currentPage = PAGES.find((p) => p.path === location.pathname);
  const routeGroup = groups.some((g) => g.name === currentPage?.navGroup) ? currentPage.navGroup : null;

  const [manualGroup, setManualGroup] = useState(null);
  useEffect(() => setManualGroup(null), [location.pathname]);

  const activeGroup = manualGroup ?? routeGroup;
  const activeGroupPages = groups.find((g) => g.name === activeGroup)?.items || [];

  const toggleGroup = (name) => setManualGroup(name === activeGroup ? null : name);

  const navLinkClass = (isActive) => cn(
    "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
    isActive
      ? "bg-primary text-primary-foreground"
      : "text-foreground hover:bg-muted"
  );

  return (
    <div className="sticky top-0 z-40 bg-card border-b border-border">
      {/* Row 1: brand, top-level pages, groups, user menu */}
      <div className="flex items-center gap-1 px-3 md:px-6 h-14 overflow-x-auto">
        <Link to="/" className="font-display font-bold text-primary shrink-0 mr-2 whitespace-nowrap">
          Distillery OS
        </Link>

        {topPages.map((p) => (
          <Link key={p.key} to={p.path} className={navLinkClass(location.pathname === p.path)}>
            {p.label}
          </Link>
        ))}

        {groups.map((group) => (
          <button
            key={group.name}
            onClick={() => toggleGroup(group.name)}
            className={cn(navLinkClass(activeGroup === group.name), "flex items-center gap-1")}
          >
            {group.name}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", activeGroup === group.name && "rotate-180")} />
          </button>
        ))}

        {bottomPages.map((p) => (
          <Link key={p.key} to={p.path} className={navLinkClass(location.pathname === p.path)}>
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

      {/* Row 2: current group's pages - stays visible while inside the group */}
      {activeGroup && (
        <div className="flex items-center gap-1 px-3 md:px-6 h-11 border-t border-border overflow-x-auto bg-muted/40">
          {activeGroupPages.map((p) => {
            const isActive = location.pathname === p.path;
            return (
              <Link
                key={p.key}
                to={p.path}
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
