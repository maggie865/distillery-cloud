import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link2, Package, Plus } from 'lucide-react';

/**
 * Material name input that opens a browsable dropdown of existing RawMaterial
 * stock items on focus (not just once you start typing), so you can pick a
 * product you already have instead of having to know its exact spelling.
 * Typing filters that list, and typed/pasted text (e.g. from an OCR-scanned
 * packing slip) that exactly matches a known ProductAlias auto-resolves to
 * the alias's canonical stock item. Text that matches nothing offers either
 * "Create new material" (accepts the typed name as-is, a new RawMaterial is
 * created when the line saves) or "Link to an existing item" — the latter
 * creates a new alias on the spot, so the next packing slip using that same
 * supplier wording auto-applies too.
 *
 * `onChange(text, matchedRawMaterial)` fires exactly once per interaction
 * (never a separate follow-up call) so the caller always applies one
 * complete, current update — two calls built from the same pre-update
 * closure would race and the second could clobber the first.
 */
export default function MaterialAutocomplete({ value, onChange, rawMaterials = [], aliases = [], onCreateAlias }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const containerRef = useRef(null);

  const aliasByLowerName = useMemo(() => {
    const map = new Map();
    for (const a of aliases) map.set((a.alias_name || '').toLowerCase().trim(), a);
    return map;
  }, [aliases]);

  const rawMaterialById = useMemo(() => {
    const map = new Map();
    for (const rm of rawMaterials) map.set(rm.id, rm);
    return map;
  }, [rawMaterials]);

  const applyMatch = (rm) => {
    onChange(rm.name, rm);
    setIsOpen(false);
    setShowLinkPicker(false);
  };

  // Auto-apply an exact alias match as the user types/pastes.
  useEffect(() => {
    const key = (value || '').toLowerCase().trim();
    if (!key) return;
    const alias = aliasByLowerName.get(key);
    if (alias) {
      const rm = rawMaterialById.get(alias.raw_material_id);
      if (rm && rm.name.toLowerCase().trim() !== key) {
        applyMatch(rm);
      }
    }
  }, [value, aliasByLowerName, rawMaterialById]);

  const term = (value || '').toLowerCase().trim();
  // With nothing typed yet, browse the full existing stock list rather than
  // showing an empty dropdown — that's the "choose from products I already
  // have" path. Typing narrows it down.
  const sortedMaterials = useMemo(
    () => [...rawMaterials].sort((a, b) => a.name.localeCompare(b.name)),
    [rawMaterials]
  );
  const matchingMaterials = term
    ? sortedMaterials.filter(rm => rm.name.toLowerCase().includes(term))
    : sortedMaterials;
  const matchingAliases = term
    ? aliases.filter(a => (a.alias_name || '').toLowerCase().includes(term))
    : [];

  const exactMatch = term && rawMaterials.some(rm => rm.name.toLowerCase().trim() === term);
  const showCreateNewHint = term.length > 1 && !exactMatch;

  const linkCandidates = rawMaterials.filter(rm =>
    !linkSearch || rm.name.toLowerCase().includes(linkSearch.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowLinkPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value, null); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        placeholder="e.g. Wheat ENA 96%"
        required
      />
      {isOpen && !showLinkPicker && (matchingMaterials.length > 0 || matchingAliases.length > 0 || showCreateNewHint) && (
        <div className="absolute top-full left-0 right-0 bg-card border border-input rounded-md shadow-lg z-50 mt-1 max-h-56 overflow-y-auto">
          {!term && matchingMaterials.length > 0 && (
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40">
              Existing stock items
            </p>
          )}
          {matchingMaterials.map(rm => (
            <button
              key={rm.id}
              type="button"
              onClick={() => applyMatch(rm)}
              className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 transition-colors flex items-center gap-2"
            >
              <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{rm.name}</span>
            </button>
          ))}
          {matchingAliases
            .filter(a => !rawMaterialById.get(a.raw_material_id) || !matchingMaterials.some(m => m.id === a.raw_material_id))
            .map(a => {
              const rm = rawMaterialById.get(a.raw_material_id);
              if (!rm) return null;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => applyMatch(rm)}
                  className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 transition-colors flex items-center gap-2"
                >
                  <Link2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm"><span className="font-medium">{a.alias_name}</span> <span className="text-muted-foreground">→ {rm.name}</span></span>
                </button>
              );
            })}
          {showCreateNewHint && (
            <>
              <button
                type="button"
                onClick={() => { onChange(value, null); setIsOpen(false); }}
                className="w-full text-left px-3 py-2.5 hover:bg-accent border-t transition-colors flex items-center gap-2 text-primary"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Create new material "{value}"</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowLinkPicker(true); setLinkSearch(value); }}
                className="w-full text-left px-3 py-2.5 hover:bg-accent border-t transition-colors flex items-center gap-2 text-primary"
              >
                <Link2 className="w-4 h-4" />
                <span className="text-sm font-medium">Link "{value}" to an existing item instead</span>
              </button>
            </>
          )}
        </div>
      )}
      {isOpen && showLinkPicker && (
        <div className="absolute top-full left-0 right-0 bg-card border border-input rounded-md shadow-lg z-50 mt-1 p-2 space-y-2">
          <Input
            autoFocus
            placeholder="Search stock items…"
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            className="text-sm"
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {linkCandidates.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2">No stock items found</p>
            ) : linkCandidates.map(rm => (
              <button
                key={rm.id}
                type="button"
                onClick={async () => {
                  await onCreateAlias?.(value, rm.id);
                  applyMatch(rm);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-accent transition-colors text-sm"
              >
                {rm.name}
              </button>
            ))}
          </div>
          <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => setShowLinkPicker(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
