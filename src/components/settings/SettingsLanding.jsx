import { Card } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { SETTINGS_NAV, FREQUENTLY_USED, findSettingsItem } from '@/lib/settingsNav';

export default function SettingsLanding({ onSelect, isSuperAdmin }) {
  const frequentlyUsed = FREQUENTLY_USED
    .map(({ categoryKey, itemKey }) => findSettingsItem(categoryKey, itemKey))
    .filter((entry) => entry && (!entry.item.superAdminOnly || isSuperAdmin));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Frequently Used</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {frequentlyUsed.map(({ category, item }) => (
            <button key={item.key} onClick={() => onSelect(category.key, item.key)} className="text-left">
              <Card className="p-5 h-full flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground mt-auto" />
              </Card>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SETTINGS_NAV.map((category) => {
            const items = category.items.filter((i) => !i.superAdminOnly || isSuperAdmin);
            if (items.length === 0) return null;
            return (
              <button key={category.key} onClick={() => onSelect(category.key, items[0].key)} className="text-left">
                <Card className="p-5 h-full flex items-start gap-3 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <category.icon className="w-5 h-5 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground">{category.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{items.map((i) => i.label).join(' · ')}</p>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
