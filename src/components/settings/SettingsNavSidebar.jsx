import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SETTINGS_NAV } from '@/lib/settingsNav';

export default function SettingsNavSidebar({ selected, onSelect, isSuperAdmin, onNavigate }) {
  const [collapsed, setCollapsed] = useState(() => new Set());

  const toggleCategory = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <nav className="space-y-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">Settings</p>
      {SETTINGS_NAV.map((category) => {
        const items = category.items.filter((i) => !i.superAdminOnly || isSuperAdmin);
        if (items.length === 0) return null;
        const isOpen = !collapsed.has(category.key);

        return (
          <div key={category.key}>
            <button
              onClick={() => toggleCategory(category.key)}
              className="w-full flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <category.icon className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">{category.label}</span>
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {isOpen && (
              <div className="mt-1 space-y-0.5">
                {items.map((item) => {
                  const isActive = selected?.categoryKey === category.key && selected?.itemKey === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => { onSelect(category.key, item.key); onNavigate?.(); }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-primary/15 text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
