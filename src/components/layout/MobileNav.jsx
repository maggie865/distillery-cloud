import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, ChevronDown, LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES, NAV_GROUPS } from '@/lib/pages';

export default function MobileNav() {
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

  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  const closeNav = () => setOpen(false);

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-between items-center px-4 py-3">
        {topPage && (
          <Link
            to={topPage.path}
            onClick={closeNav}
            className={cn(
              "flex flex-col items-center py-2 px-2 text-[10px] font-medium transition-colors",
              location.pathname === topPage.path ? "text-primary" : "text-muted-foreground"
            )}
          >
            <topPage.icon className="w-5 h-5 mb-0.5" />
            {topPage.label === 'Dashboard' ? 'Home' : topPage.label}
          </Link>
        )}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center py-2 px-2 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors">
              <Menu className="w-5 h-5 mb-0.5" />
              Menu
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
            <div className="space-y-2 mt-4">
              {groups.map((group) => (
                <Collapsible key={group.name} open={expandedGroups[group.name]} onOpenChange={() => toggleGroup(group.name)}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-muted font-medium text-foreground">
                    {group.name}
                    <ChevronDown className={cn("w-4 h-4 transition-transform", expandedGroups[group.name] && "rotate-180")} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={closeNav}
                          className={cn(
                            "flex items-center gap-3 px-6 py-2 rounded-md transition-colors text-sm",
                            isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              ))}
              <div className="border-t pt-2 mt-4">
                {bottomPages.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={closeNav}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                      location.pathname === item.path ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                ))}
              </div>

              {/* User info + logout */}
              <div className="border-t border-border pt-3 mt-2">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {(user?.email || user?.name || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{user?.name || user?.email || 'User'}</p>
                      <p className="text-xs text-muted-foreground">{user?.role || ''}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { logout(); closeNav(); }}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors px-2 py-1.5 rounded-md hover:bg-destructive/10"
                  >
                    <LogOut className="w-4 h-4" />
                    Log out
                  </button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
