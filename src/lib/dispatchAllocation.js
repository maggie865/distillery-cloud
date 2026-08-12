// FIFO batch allocation for dispatches sourced from Bluff Distillery stock
// (finished_good). Originally lived inline in DispatchForm.jsx's
// dispatchMutation; pulled out here because DispatchHub now needs the same
// allocator when a Quick-Order-created dispatch (created with no
// batch_number — Quick Order is product/qty, not batch-level) transitions
// to status 'dispatched' and a real batch has to be picked for the first time.

export function calcWeightKg(bottleSizeMl, numBottles) {
  if (!numBottles) return 0;
  const kgPerBottle = bottleSizeMl <= 250 ? (6 / 12) : (10 / 6);
  return parseFloat((kgPerBottle * numBottles).toFixed(2));
}

export const EMISSION_FACTORS = { road: 0.12, courier: 0.12, air: 0.9, sea: 0.01, pickup: 0 };

export function calcCO2e(distanceKm, weightKg, method) {
  if (!distanceKm || !weightKg || !method) return 0;
  return parseFloat(((distanceKm * weightKg / 1000) * (EMISSION_FACTORS[method] || 0)).toFixed(3));
}

// Groups sellable finished_good rows into { product_name, bottle_size_ml,
// batches: [...FIFO sorted], totalAvailable } — the same shape
// DispatchForm's bluffProductOptions builds for its own product/batch
// pickers, so DispatchHub can run the identical allocator against it.
export function buildBluffProductOptions(finishedGoods) {
  const sellable = finishedGoods.filter(fg => (fg.quantity_bottles || 0) > 0);
  const map = {};
  for (const fg of sellable) {
    const key = `${fg.product_name}||${fg.bottle_size_ml || ''}`;
    if (!map[key]) map[key] = { product_name: fg.product_name, bottle_size_ml: fg.bottle_size_ml || '', batches: [] };
    map[key].batches.push(fg);
  }
  return Object.values(map).map(opt => {
    const batchesWithAvail = opt.batches.map(fg => ({ ...fg, available: fg.quantity_bottles || 0 })).filter(b => b.available > 0);
    batchesWithAvail.sort((a, b) => {
      const an = (a.batch_number || '').match(/\d+/g)?.join('.') || '';
      const bn = (b.batch_number || '').match(/\d+/g)?.join('.') || '';
      if (an && bn) return an.localeCompare(bn, undefined, { numeric: true });
      if (an) return -1;
      if (bn) return 1;
      return new Date(a.created_at) - new Date(b.created_at);
    });
    return { ...opt, batches: batchesWithAvail, totalAvailable: batchesWithAvail.reduce((s, b) => s + b.available, 0) };
  }).filter(opt => opt.totalAvailable > 0);
}

// Allocates every line item in `lineItems` (each { productKey: "name||size",
// quantity, batchId? }) against `bluffProductOptions`, FIFO across shared
// availability unless a line pins a specific batchId (manual mode) — exact
// behavior DispatchForm's inline allocator had. Returns
// [{ batch, take, lals, weightKg, co2e }], one entry per (line, batch) pair
// — a line spanning multiple batches produces multiple entries, which the
// caller turns into one dispatch row each. Throws if any line can't be
// fully allocated.
export function allocateBluffLineItems(lineItems, bluffProductOptions, { distanceKm = 0, transportMethod } = {}) {
  const batchAvailMap = {};
  for (const opt of bluffProductOptions) for (const b of opt.batches) batchAvailMap[b.id] = b.available;
  const allAllocations = [];

  for (const li of lineItems) {
    const product = bluffProductOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
    if (!product) continue;
    let remaining = parseInt(li.quantity) || 0;
    if (li.batchId) {
      const batch = product.batches.find(b => b.id === li.batchId);
      if (!batch) throw new Error(`Batch not found for ${product.product_name}`);
      const avail = batchAvailMap[batch.id] || 0;
      if (avail < remaining) throw new Error(`Insufficient stock for ${product.product_name} batch ${batch.batch_number} (${avail} available)`);
      const bottleSize = batch.bottle_size_ml || 700;
      const lals = ((remaining * bottleSize) / 1000) * (batch.abv_percent || 0) / 100;
      const weightKg = calcWeightKg(bottleSize, remaining);
      allAllocations.push({ batch, take: remaining, lals, weightKg, co2e: calcCO2e(distanceKm, weightKg, transportMethod) });
      batchAvailMap[batch.id] = avail - remaining;
      remaining = 0;
    } else {
      for (const batch of product.batches) {
        if (remaining <= 0) break;
        const avail = batchAvailMap[batch.id] || 0;
        if (avail <= 0) continue;
        const take = Math.min(remaining, avail);
        const bottleSize = batch.bottle_size_ml || 700;
        const lals = ((take * bottleSize) / 1000) * (batch.abv_percent || 0) / 100;
        const weightKg = calcWeightKg(bottleSize, take);
        allAllocations.push({ batch, take, lals, weightKg, co2e: calcCO2e(distanceKm, weightKg, transportMethod) });
        batchAvailMap[batch.id] = avail - take;
        remaining -= take;
      }
    }
    if (remaining > 0) throw new Error(`Insufficient stock for ${product.product_name} (${product.bottle_size_ml}ml)`);
  }
  return allAllocations;
}
