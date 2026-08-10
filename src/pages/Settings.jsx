import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import SettingsNavSidebar from '@/components/settings/SettingsNavSidebar';
import SettingsLanding from '@/components/settings/SettingsLanding';
import SettingsLinkOut from '@/components/settings/SettingsLinkOut';
import SettingsSearch from '@/components/settings/SettingsSearch';
import { findSettingsItem } from '@/lib/settingsNav';

export default function Settings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [selected, setSelected] = useState(null); // { categoryKey, itemKey } | null = landing page
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleSelect = (categoryKey, itemKey) => setSelected({ categoryKey, itemKey });
  const resolved = selected ? findSettingsItem(selected.categoryKey, selected.itemKey) : null;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Settings" subtitle="Configure and manage your Distillery OS">
        <SettingsSearch onSelect={handleSelect} isSuperAdmin={isSuperAdmin} />
      </PageHeader>

      {/* Mobile settings menu trigger */}
      <div className="lg:hidden mb-5">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-between gap-2">
              <span className="flex items-center gap-2 truncate">
                <Menu className="w-4 h-4 shrink-0" /> {resolved ? resolved.item.label : 'Settings Menu'}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto">
            <SheetHeader><SheetTitle>Settings</SheetTitle></SheetHeader>
            <div className="mt-4">
              <SettingsNavSidebar
                selected={selected}
                onSelect={handleSelect}
                isSuperAdmin={isSuperAdmin}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
        <div className="hidden lg:block">
          <SettingsNavSidebar selected={selected} onSelect={handleSelect} isSuperAdmin={isSuperAdmin} />
        </div>

        <div className="min-w-0">
          {!resolved ? (
            <SettingsLanding onSelect={handleSelect} isSuperAdmin={isSuperAdmin} />
          ) : (
            <div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4 flex-wrap">
                <button onClick={() => setSelected(null)} className="hover:text-foreground transition-colors">Settings</button>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                <span>{resolved.category.label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                <span className="text-foreground font-medium">{resolved.item.label}</span>
              </div>

              {resolved.item.kind === 'link' ? (
                <SettingsLinkOut
                  label={resolved.item.label}
                  description={resolved.item.description}
                  path={resolved.item.path}
                  icon={resolved.item.icon}
                />
              ) : (
                <div>
                  <div className="mb-5">
                    <h1 className="text-xl font-display font-bold text-foreground">{resolved.item.label}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{resolved.item.description}</p>
                  </div>
                  <resolved.item.component />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
