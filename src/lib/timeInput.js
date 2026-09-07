/**
 * src/lib/timeInput.js — "set to now" helpers for datetime-local/time
 * inputs, shared by the distillation Run Timeline and SNS run timing
 * fields so operators can tap a field's current time instead of typing it
 * from memory after the fact.
 */

const pad = (n) => String(n).padStart(2, '0');

// Local time, not UTC — new Date().toISOString() would shift the clock by
// the browser's UTC offset, which is exactly wrong for "stamp right now".
export const nowDateTimeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
