import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES, NAV_GROUPS } from '@/lib/pages';

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { canAccess } = usePagePermissions();
  const isSuperAdmin = user?.role === 'super_admin';

  const visible = (p) => !p.superAdminOnly && (isSuperAdmin || canAccess(p.key, user?.role));

  const topPage = PAGES.find((p) => p.navGroup === 'top' && visible(p));
  const bottomPages = PAGES.filter((p) => p.navGroup === 'bottom' && (visible(p) || (p.superAdminOnly && isSuperAdmin)));
  const groups = NAV_GROUPS
    .map((name) => ({ name, items: PAGES.filter((p) => p.navGroup === name && visible(p)) }))
    .filter((g) => g.items.length > 0);

  const [expandedGroups, setExpandedGroups] = useState(() => {
    const init = {};
    for (const name of NAV_GROUPS) init[name] = true; // start all open
    return init;
  });

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  return (
    <aside className="fixed top-0 left-0 h-full w-[240px] bg-sidebar flex flex-col z-40 border-r border-sidebar-border">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <h1 className="text-lg font-display font-bold text-sidebar-primary">Distillery OS</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {topPage && (
          <Link
            to={topPage.path}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname === topPage.path
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <topPage.icon className="w-4 h-4" />
            {topPage.label}
          </Link>
        )}

        {groups.map((group) => (
          <Collapsible
            key={group.name}
            open={expandedGroups[group.name]}
            onOpenChange={() => toggleGroup(group.name)}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors mt-2">
              {group.name}
              <ChevronDown className={cn("w-3 h-3 transition-transform", expandedGroups[group.name] && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 mt-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border space-y-0.5">
        {bottomPages.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* User info + logout */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-sidebar-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-sidebar-primary">
              {(user?.email || user?.name || '?')[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name || user?.email || 'User'}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{user?.role || ''}</p>
          </div>
          <button
            onClick={() => logout()}
            title="Log out"
            className="shrink-0 p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
