/**
 * src/lib/customerHealth.js — derived customer sales/CRM metrics.
 *
 * Nothing here is stored — it's all computed at read time from
 * customer_activity, customer_request, and dispatch records, per the
 * "build the system relationally, calculate rather than store" requirement.
 * Every function is pure and takes plain arrays already scoped to one
 * customer, so it's cheap to reuse across the customer list, detail page,
 * Needs Attention, and the Sales dashboard without re-fetching per customer.
 */

export const VISIT_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'fortnightly', label: 'Fortnightly', days: 14 },
  { value: 'monthly', label: 'Monthly', days: 30 },
  { value: 'every_2_months', label: 'Every 2 months', days: 60 },
  { value: 'quarterly', label: 'Quarterly', days: 90 },
  { value: 'as_required', label: 'As required', days: null },
];

// No per-customer "expected contact interval" field exists in the schema
// (only visit_frequency does) — this fixed default drives the "No Recent
// Contact" Needs Attention category until/unless that becomes a real field.
export const DEFAULT_CONTACT_INTERVAL_DAYS = 30;

export function visitFrequencyDays(value) {
  return VISIT_FREQUENCIES.find((f) => f.value === value)?.days ?? null;
}

export function visitFrequencyLabel(value) {
  return VISIT_FREQUENCIES.find((f) => f.value === value)?.label || value || 'Not set';
}

export function daysSince(dateStr) {
  if (!dateStr) return null;
  const ms = new Date().setHours(0, 0, 0, 0) - new Date(dateStr).setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

export function daysUntil(dateStr) {
  const d = daysSince(dateStr);
  return d == null ? null : -d;
}

export function lastActivityDate(activities, type) {
  const matching = type ? activities.filter((a) => a.type === type) : activities;
  if (matching.length === 0) return null;
  return matching.reduce((latest, a) => (!latest || a.date > latest ? a.date : latest), null);
}

// Earliest outstanding follow-up (overdue ones surface first since an
// overdue date sorts before a future one).
export function nextFollowUp(activities) {
  const pending = activities.filter((a) => a.follow_up_required && a.follow_up_date);
  if (pending.length === 0) return null;
  const soonest = pending.reduce((best, a) => (!best || a.follow_up_date < best.follow_up_date ? a : best), null);
  const days = daysSince(soonest.follow_up_date);
  return { date: soonest.follow_up_date, task: soonest.follow_up_task, activityId: soonest.id, overdue: days > 0 };
}

export function openRequests(requests) {
  return requests.filter((r) => r.status !== 'resolved');
}

export function isVisitOverdue(customer, lastVisit) {
  const freqDays = visitFrequencyDays(customer.visit_frequency);
  if (freqDays == null) return false;
  const since = daysSince(lastVisit);
  if (since == null) return true; // never visited, has a frequency set → overdue
  return since > freqDays;
}

export function isContactOverdue(lastContact, intervalDays = DEFAULT_CONTACT_INTERVAL_DAYS) {
  const since = daysSince(lastContact);
  if (since == null) return true;
  return since > intervalDays;
}

function matchesCustomerName(dispatchName, customerName) {
  return (dispatchName || '').trim().toLowerCase() === (customerName || '').trim().toLowerCase();
}

/**
 * The single aggregate used everywhere a customer row needs its computed
 * stats: list table, detail page overview, Needs Attention, Sales dashboard.
 */
export function computeCustomerStats(customer, { activities = [], requests = [], dispatches = [] } = {}) {
  const lastVisit = lastActivityDate(activities, 'visit');
  const lastContact = lastActivityDate(activities, null);
  const matchingDispatches = dispatches.filter((d) => matchesCustomerName(d.customer_name, customer.business_name));
  const lastOrder = matchingDispatches.reduce((latest, d) => (!latest || d.dispatch_date > latest ? d.dispatch_date : latest), null);
  const totalOrders = matchingDispatches.length;
  const followUp = nextFollowUp(activities);
  const openReqs = openRequests(requests);
  const visitOverdue = isVisitOverdue(customer, lastVisit);
  const contactOverdue = isContactOverdue(lastContact);
  const overdueFollowUp = !!followUp?.overdue;

  let health = 'healthy';
  let healthReason = 'Recently active, nothing outstanding';
  if (overdueFollowUp || openReqs.some((r) => (daysSince(r.date_received) || 0) > 14) || (visitOverdue && daysSince(lastVisit) > (visitFrequencyDays(customer.visit_frequency) || 0) * 2)) {
    health = 'at_risk';
    healthReason = overdueFollowUp ? 'Follow-up overdue' : openReqs.length > 0 ? 'Unresolved request outstanding' : 'Visit significantly overdue';
  } else if (visitOverdue || contactOverdue || openReqs.length > 0) {
    health = 'attention';
    healthReason = visitOverdue ? 'Visit overdue' : contactOverdue ? 'No recent contact' : 'Open request';
  }

  return {
    lastVisit,
    lastContact,
    lastOrder,
    totalOrders,
    followUp,
    openRequests: openReqs,
    visitOverdue,
    contactOverdue,
    health,
    healthReason,
  };
}
