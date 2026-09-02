/**
 * src/lib/stillEnergy.js — calculated (not metered) electricity and water
 * use for the DYE-II-300L still, for EMS reporting.
 *
 * Spec: 3 x 7kW heating elements (21kW total), 0.55kW agitator, 0.75kW CIP
 * pump. Only the heating elements are modelled here — the agitator and CIP
 * pump don't have a known run duration per distillation run, so including
 * them would be a guess rather than a calculation.
 *
 * Normal distillation: 3 elements from Run Start until Heads starts, drops
 * to 2 elements through Heads and Hearts, back to 3 elements for Tails.
 * SNS run: all 3 elements for the entire run.
 *
 * Water: the condenser runs closed-loop (recirculated) in both run types,
 * so it uses no real mains water — its rated flow is water AVOIDED, not
 * consumed, and is reported as "water saved". The dephlegmator (SNS runs
 * only) is genuine consumption, not recirculated — its real reading should
 * be logged per run; until it is, this falls back to an estimate from the
 * rated flow.
 *
 * Nothing here is stored — it's calculated at read time from each run's
 * own timing fields, the same "calculate, don't store" approach used
 * elsewhere in this app (e.g. co2e_kg).
 */

export const ELEMENT_KW = 7;
export const THREE_ELEMENT_KW = ELEMENT_KW * 3; // 21kW
export const TWO_ELEMENT_KW = ELEMENT_KW * 2; // 14kW

export const CONDENSER_LPH_MIN = 600;
export const CONDENSER_LPH_MAX = 900;
export const CONDENSER_LPH_MID = (CONDENSER_LPH_MIN + CONDENSER_LPH_MAX) / 2; // 750

export const DEPHLEGMATOR_LPH_MIN = 200;
export const DEPHLEGMATOR_LPH_MAX = 300;
export const DEPHLEGMATOR_LPH_MID = (DEPHLEGMATOR_LPH_MIN + DEPHLEGMATOR_LPH_MAX) / 2; // 250

// run_start_time is a full datetime-local string; every other timing field
// is time-only ("HH:MM") and assumed to fall on run_start_time's calendar
// day — mirrors RunTimeline.jsx's own toComparable helper, since that's how
// these fields are actually entered.
function toTimestamp(runStartValue, value) {
  if (!value) return null;
  if (value.includes('T') || value.length > 5) {
    const d = new Date(value);
    return isNaN(d) ? null : d.getTime();
  }
  const anchor = runStartValue ? runStartValue.slice(0, 10) : null;
  if (!anchor) return null;
  const d = new Date(`${anchor}T${value}`);
  return isNaN(d) ? null : d.getTime();
}

function hoursBetween(startMs, endMs) {
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return (endMs - startMs) / 3600000;
}

/**
 * Returns null if no usable timing has been logged for this run at all.
 * `complete` is false when only some segments could be computed (a gap in
 * the timeline) — the kWh/water figures are still returned, just partial.
 */
export function distillationRunEnergy(run) {
  const start = toTimestamp(run.run_start_time, run.run_start_time);
  const headsStart = toTimestamp(run.run_start_time, run.heads_start_time);
  const heartsEnd = toTimestamp(run.run_start_time, run.hearts_end_time);
  const end = toTimestamp(run.run_start_time, run.run_end_time);

  const preHeadsHours = hoursBetween(start, headsStart);
  const headsHeartsHours = hoursBetween(headsStart, heartsEnd);
  const tailsHours = hoursBetween(heartsEnd, end);
  const knownPhaseHours = [preHeadsHours, headsHeartsHours, tailsHours].filter((h) => h !== null);

  // Full Run Start -> Run End span, independent of whether every cut time
  // in between was logged. Water use only depends on this — the condenser
  // runs continuously the whole time regardless of which heating phase is
  // active - so a missing Heads/Hearts marker shouldn't understate it the
  // way it correctly does for kWh (which genuinely needs the phase
  // breakdown, since wattage differs by phase).
  const fullRunHours = hoursBetween(start, end);
  if (knownPhaseHours.length === 0 && fullRunHours === null) return null;

  const kwh = (preHeadsHours || 0) * THREE_ELEMENT_KW
    + (headsHeartsHours || 0) * TWO_ELEMENT_KW
    + (tailsHours || 0) * THREE_ELEMENT_KW;
  const knownPhaseTotal = knownPhaseHours.reduce((s, h) => s + h, 0);
  const totalHours = fullRunHours !== null ? fullRunHours : knownPhaseTotal;

  return {
    preHeadsHours,
    headsHeartsHours,
    tailsHours,
    totalHours,
    kwh: parseFloat(kwh.toFixed(3)),
    waterSavedLitres: parseFloat((totalHours * CONDENSER_LPH_MID).toFixed(1)),
    complete: preHeadsHours !== null && headsHeartsHours !== null && tailsHours !== null,
  };
}

export function snsRunEnergy(run) {
  const start = toTimestamp(run.run_start_time, run.run_start_time);
  const end = toTimestamp(run.run_start_time, run.run_end_time);
  const totalHours = hoursBetween(start, end);
  if (totalHours === null) return null;

  const dephlegmatorIsEstimate = run.dephlegmator_water_litres == null;
  const dephlegmatorLitres = dephlegmatorIsEstimate
    ? totalHours * DEPHLEGMATOR_LPH_MID
    : run.dephlegmator_water_litres;

  return {
    totalHours,
    kwh: parseFloat((totalHours * THREE_ELEMENT_KW).toFixed(3)),
    waterSavedLitres: parseFloat((totalHours * CONDENSER_LPH_MID).toFixed(1)),
    dephlegmatorLitres: parseFloat(dephlegmatorLitres.toFixed(1)),
    dephlegmatorIsEstimate,
    complete: true,
  };
}
