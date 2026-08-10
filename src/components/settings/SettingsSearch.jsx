import { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { SETTINGS_NAV } from '@/lib/settingsNav';

export default function SettingsSearch({ onSelect, isSuperAdmin }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const allItems = useMemo(() => {
    const flat = [];
    for (const category of SETTINGS_NAV) {
      for (const item of category.items) {
        if (item.superAdminOnly && !isSuperAdmin) continue;
        flat.push({ category, item });
      }
    }
    return flat;
  }, [isSuperAdmin]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allItems.filter(({ category, item }) =>
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      category.label.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, allItems]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (category, item) => {
    onSelect(category.key, item.key);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full sm:w-72">
      <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search settings…"
        className="pl-9"
      />
      {open && query.trim() && (
        <div className="absolute top-full left-0 right-0 bg-card border border-input rounded-md shadow-lg z-50 mt-1 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No settings found</p>
          ) : results.map(({ category, item }) => (
            <button
              key={`${category.key}-${item.key}`}
              type="button"
              onClick={() => handleSelect(category, item)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent border-b last:border-b-0 transition-colors flex items-center gap-2.5"
            >
              <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.label}</p>
                <p className="text-xs text-muted-foreground truncate">{category.label} · {item.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
