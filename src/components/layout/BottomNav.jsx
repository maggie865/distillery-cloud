import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES } from '@/lib/pages';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose,
} from '@/components/ui/drawer';

// The four keys shown as primary bottom-tab destinations, in order. Kept to
// a short, fixed set (App Store / Play Store review guidance is 3-5 tabs)
// rather than mirroring every top-nav entry - everything else lives behind
// "More".
const PRIMARY_KEYS = ['dashboard', 'production', 'inventory-hub', 'sales'];

/**
 * Mobile-only bottom tab bar (hidden md:up, where HubSidebar/TopNav's row 2
 * already give plenty of room). Mirrors the native iOS/Android tab-bar
 * convention: a handful of primary destinations plus a "More" tab that
 * opens a bottom sheet with everything else, so the whole app stays
 * reachable without needing the horizontal-scrolling TopNav on a phone.
 */
export default function BottomNav() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { canAccess } = usePagePermissions();
  const isSuperAdmin = user?.role === 'super_admin';
  const [moreOpen, setMoreOpen] = useState(false);

  const visible = (p) => !p.superAdminOnly && (isSuperAdmin || canAccess(p.key, user?.role));

  const primaryPages = PRIMARY_KEYS
    .map((key) => PAGES.find((p) => p.key === key))
    .filter((p) => p && visible(p));

  const primaryPaths = new Set(primaryPages.map((p) => p.path));
  const morePages = PAGES.filter((p) =>
    p.navGroup && p.navGroup !== 'top' && !primaryPaths.has(p.path) &&
    (visible(p) || (p.superAdminOnly && isSuperAdmin))
  );
  const moreActive = !primaryPaths.has(location.pathname) &&
    morePages.some((p) => p.path === location.pathname);

  return (
    <>
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-card/95 backdrop-blur-md border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {primaryPages.map((p) => {
            const active = location.pathname === p.path;
            return (
              <Link
                key={p.key}
                to={p.path}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <p.icon className="w-5 h-5" />
                <span className="truncate max-w-full px-1">{p.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-medium transition-colors",
              moreActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Menu className="w-5 h-5" />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="md:hidden max-h-[80vh]">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle>More</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4 space-y-1">
            {morePages.map((p) => (
              <DrawerClose asChild key={p.key}>
                <Link
                  to={p.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-lg text-sm min-h-[44px] transition-colors",
                    location.pathname === p.path
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <p.icon className="w-4 h-4 shrink-0" />
                  {p.label}
                </Link>
              </DrawerClose>
            ))}
            <div className="h-px bg-border my-2" />
            <button
              onClick={() => { setMoreOpen(false); logout(); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm min-h-[44px] text-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Log out
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
