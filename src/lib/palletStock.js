import { base44 } from '@/api/base44Client';

// A pallet is a manifest over existing FinishedGood/WarehouseStock, not the
// source of truth for stock levels — so reconciling it when a dispatch's
// stock is deducted/restored is always best-effort and must never throw or
// block the real (already-happened) stock movement it's mirroring.
const findMatchingItem = (items, { product_name, batch_number, bottle_size_ml }) =>
  items.find(it =>
    it.product_name === product_name &&
    (it.batch_number || null) === (batch_number || null) &&
    Number(it.bottle_size_ml) === Number(bottle_size_ml)
  );

// Called when a dispatch tied to a pallet actually deducts stock (entering
// dispatched/delivered) — takes the dispatched quantity off that pallet's
// matching line item. Returns { ok } so callers that want to surface a
// mismatch (e.g. the create form) can; callers that don't (edit/return/
// delete transitions) can ignore it.
export async function deductFromPallet(palletId, { product_name, batch_number, bottle_size_ml, quantity_bottles }) {
  if (!palletId || !(quantity_bottles > 0)) return { ok: true };
  try {
    const items = await base44.entities.PalletItem.filter({ pallet_id: palletId });
    const item = findMatchingItem(items, { product_name, batch_number, bottle_size_ml });
    if (!item) return { ok: false, reason: 'not_found' };

    const take = Math.min(quantity_bottles, item.quantity_bottles || 0);
    const lalsPerBottle = (item.quantity_bottles || 0) > 0 && item.total_lals ? item.total_lals / item.quantity_bottles : 0;
    const newQty = (item.quantity_bottles || 0) - take;
    if (newQty <= 0) {
      await base44.entities.PalletItem.delete(item.id);
    } else {
      await base44.entities.PalletItem.update(item.id, {
        quantity_bottles: newQty,
        total_lals: parseFloat(Math.max(0, (item.total_lals || 0) - take * lalsPerBottle).toFixed(4)),
      });
    }
    return { ok: take >= quantity_bottles };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

// Mirror of deductFromPallet — called whenever a dispatch's deducted stock
// is restored (leaving dispatched/delivered, returned, or deleted).
// Recreates the pallet item if it's gone, same as the transfer-cancel fix.
export async function restoreToPallet(palletId, { product_name, batch_number, bottle_size_ml, quantity_bottles, total_lals }) {
  if (!palletId || !(quantity_bottles > 0)) return;
  try {
    const items = await base44.entities.PalletItem.filter({ pallet_id: palletId });
    const item = findMatchingItem(items, { product_name, batch_number, bottle_size_ml });
    if (item) {
      await base44.entities.PalletItem.update(item.id, {
        quantity_bottles: (item.quantity_bottles || 0) + quantity_bottles,
        total_lals: parseFloat(((item.total_lals || 0) + (total_lals || 0)).toFixed(4)),
      });
    } else {
      await base44.entities.PalletItem.create({
        pallet_id: palletId,
        product_name,
        batch_number,
        bottle_size_ml,
        quantity_bottles,
        total_lals: total_lals || 0,
        source: 'manual',
      });
    }
  } catch {
    // Best-effort only.
  }
}

// Called after merging two FinishedGood product-name variants of the same
// physical product/batch/size into one canonical name (e.g. a repair tool
// collapsing "London Dry Gin 200ml" into "London Dry Gin") — any pallet_item
// still keyed to an old name would otherwise silently stop matching every
// pallet-aware lookup in this file (dispatch, transfer, bottling), leaving
// that pallet's manifest permanently stale. Renames matching items to the
// canonical name, merging into an existing same-pallet item under that name
// if one's already there instead of leaving two rows for the same product.
export async function renamePalletItemsForMerge(oldProductNames, newProductName, batchNumber, bottleSizeMl) {
  if (newProductName == null || !oldProductNames?.length) return;
  try {
    const all = await base44.entities.PalletItem.list('-created_at', 5000);
    const affected = all.filter(it =>
      oldProductNames.includes(it.product_name) &&
      it.product_name !== newProductName &&
      (it.batch_number || null) === (batchNumber || null) &&
      Number(it.bottle_size_ml) === Number(bottleSizeMl)
    );
    for (const it of affected) {
      const canonical = all.find(o =>
        o.id !== it.id &&
        o.pallet_id === it.pallet_id &&
        o.product_name === newProductName &&
        (o.batch_number || null) === (batchNumber || null) &&
        Number(o.bottle_size_ml) === Number(bottleSizeMl)
      );
      if (canonical) {
        await base44.entities.PalletItem.update(canonical.id, {
          quantity_bottles: (canonical.quantity_bottles || 0) + (it.quantity_bottles || 0),
          total_lals: parseFloat(((canonical.total_lals || 0) + (it.total_lals || 0)).toFixed(4)),
        });
        await base44.entities.PalletItem.delete(it.id);
      } else {
        await base44.entities.PalletItem.update(it.id, { product_name: newProductName });
      }
    }
  } catch {
    // Best-effort only — never block the product-name merge itself.
  }
}
