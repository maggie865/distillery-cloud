// Shared derived-value math for the Tank Detail page — kept in one place so
// LAL and utilisation are always computed the same way everywhere they're
// displayed, per the "calculate rather than store" requirement.

export function calcLal(volumeLitres, abvPercent) {
  if (volumeLitres == null || abvPercent == null) return null;
  return (volumeLitres * abvPercent) / 100;
}

export function calcUtilisationPct(volumeLitres, capacityLitres) {
  if (!capacityLitres || capacityLitres <= 0) return 0;
  return Math.min(100, Math.max(0, ((volumeLitres || 0) / capacityLitres) * 100));
}

// State-changing tank_movement actions, in the order the app's own
// TransferDialog mutation applies them to storage_tank.current_volume.
// 'measurement', 'note', 'cleaning', and the maintenance markers are pure
// log entries and don't move volume.
export function replayVolumeHistory(movements) {
  const sorted = [...movements].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let running = 0;
  const points = [];
  for (const m of sorted) {
    const vol = m.volume_litres || 0;
    let changed = true;
    switch (m.action) {
      case 'fill':
      case 'transfer_in':
        running += vol;
        break;
      case 'transfer_out':
      case 'bottling_draw':
        running -= vol;
        break;
      case 'empty':
        running = 0;
        break;
      case 'adjust':
        running = vol;
        break;
      default:
        changed = false;
    }
    running = Math.max(0, running);
    if (changed) {
      points.push({ id: m.id, date: m.date, createdAt: m.created_at, volume: running, action: m.action });
    }
  }
  return points;
}
