import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES } from '@/lib/pages';

const COLLAPSE_STORAGE_KEY = 'hubSidebarCollapsed';

/**
 * Left nav for pages inside a hub group (Production/Inventory/Compliance/
 * EMS — any navGroup with an isHub page, see pages.js). Renders nothing on
 * any other page, so it's safe to mount unconditionally in AppLayout.
 * Desktop-only (hidden below md) — on mobile the hub's own tile page
 * already serves as the "browse this group" screen, and there isn't
 * horizontal room for a persistent rail alongside the content.
 */
export default function HubSidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const { canAccess } = usePagePermissions();
  const isSuperAdmin = user?.role === 'super_admin';

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const currentPage = PAGES.find((p) => p.path === location.pathname);
  const navGroup = currentPage?.navGroup;
  const visible = (p) => !p.superAdminOnly && (isSuperAdmin || canAccess(p.key, user?.role));
  const groupPages = navGroup ? PAGES.filter((p) => p.navGroup === navGroup && visible(p)) : [];
  const hub = groupPages.find((p) => p.isHub);

  if (!hub) return null;

  const subPages = groupPages.filter((p) => p !== hub);

  return (
    <aside className={cn(
      "hidden md:flex flex-col shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-border bg-card/60 transition-[width] duration-150",
      collapsed ? "w-14" : "w-56"
    )}>
      <div className="flex items-center justify-between px-2.5 py-3 border-b border-border shrink-0">
        {!collapsed && <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate px-1">{navGroup}</span>}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 ml-auto"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <SidebarLink page={hub} label="Overview" active={location.pathname === hub.path} collapsed={collapsed} />
        {subPages.length > 0 && <div className={cn("h-px bg-border my-1.5", collapsed ? "mx-1" : "mx-2")} />}
        {subPages.map((p) => (
          <SidebarLink key={p.key} page={p} active={location.pathname === p.path} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  );
}

function SidebarLink({ page, label, active, collapsed }) {
  return (
    <Link
      to={page.path}
      title={collapsed ? (label || page.label) : undefined}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors",
        collapsed && "justify-center",
        active ? "bg-primary text-primary-foreground font-medium" : "text-foreground hover:bg-muted"
      )}
    >
      <page.icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{label || page.label}</span>}
    </Link>
  );
}
