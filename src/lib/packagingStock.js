/**
 * src/lib/packagingStock.js — shared packaging-material matching and
 * stock-sufficiency checks for a packaging recipe.
 *
 * Extracted from BottlingFloor.jsx's completeRunMutation/deleteRunMutation,
 * which each had their own copy of this exact matching logic — kept here
 * as one source of truth so the pre-run stock check and the actual
 * deduction/reversal can never drift apart on what counts as a match.
 */

export function isBoxOrCase(name) {
  const n = (name || '').toLowerCase();
  return n.includes('box') || n.includes('case') || n.includes('carton') || n.includes('shipper');
}

// Fuzzy name match — handles minor naming differences between a recipe's
// packaging item name and the raw material it's actually stocked under.
export function findPackagingMaterial(rawMaterials, pkgName) {
  const target = (pkgName || '').toLowerCase().trim();
  if (!target) return undefined;
  const exact = rawMaterials.find((r) => (r.name || '').toLowerCase().trim() === target);
  if (exact) return exact;
  return rawMaterials.find((r) => {
    const name = (r.name || '').toLowerCase().trim();
    return name.includes(target) || target.includes(name);
  });
}

/**
 * Checks a packaging recipe's materials against current raw material stock
 * for a given expected output. Returns one row per packaging item:
 * { name, needed, onHand, shortfall, found }. `bottles`/`cases` are the
 * expected yield — cases only matters for box/carton-type items.
 */
export function checkPackagingStock(recipe, rawMaterials, { bottles = 0, cases = 0 } = {}) {
  if (!recipe?.packaging?.length) return [];
  return recipe.packaging.filter((p) => p.name).map((pkg) => {
    const needed = isBoxOrCase(pkg.name) ? (pkg.quantity || 1) * cases : (pkg.quantity || 1) * bottles;
    const rm = findPackagingMaterial(rawMaterials, pkg.name);
    const onHand = rm?.quantity || 0;
    return {
      name: pkg.name,
      needed,
      onHand,
      shortfall: Math.max(0, needed - onHand),
      found: !!rm,
    };
  });
}
