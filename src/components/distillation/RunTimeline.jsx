import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Clock, Timer } from 'lucide-react';
import { nowDateTimeLocal, nowTime } from '@/lib/timeInput';

/**
 * Detailed run timeline + ABV readings log for a distillation run.
 * Only Run Start carries a date; all other cut times and readings are time-only
 * (assumed to occur on the same day as Run Start).
 *
 * Props:
 *  - form: the form object with timeline/abv fields
 *  - set: (field, value) => void setter
 */
export default function RunTimeline({ form, set }) {
  const addReading = () => {
    const readings = Array.isArray(form.abv_readings) ? form.abv_readings : [];
    set('abv_readings', [...readings, { time: '', abv: '', temp: '', notes: '' }]);
  };
  const updateReading = (i, field, value) => {
    const readings = [...(form.abv_readings || [])];
    readings[i] = { ...readings[i], [field]: value };
    set('abv_readings', readings);
  };
  const removeReading = (i) => {
    const readings = (form.abv_readings || []).filter((_, idx) => idx !== i);
    set('abv_readings', readings);
  };

  // Run Start keeps the date; every other field is time-only
  const dateField = { key: 'run_start_time', label: 'Run Start (date & time)' };
  const timeFields = [
    { key: 'heads_start_time', label: 'Heads Began' },
    { key: 'heads_end_time', label: 'Heads Ended / Hearts Began' },
    { key: 'hearts_end_time', label: 'Hearts Ended / Tails Began' },
    { key: 'tails_end_time', label: 'Tails Ended' },
    { key: 'run_end_time', label: 'Run End' },
  ];

  // Combine the date portion of Run Start with a time-only value (HH:MM)
  // so durations can be computed across the same day.
  const toComparable = (val) => {
    if (!val) return null;
    // Already a full datetime string
    if (val.includes('T') || val.length > 5) {
      const d = new Date(val);
      return isNaN(d) ? null : d.getTime();
    }
    // Time-only value — anchor to Run Start date (or today as fallback)
    const anchor = form.run_start_time ? form.run_start_time.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const d = new Date(`${anchor}T${val}`);
    return isNaN(d) ? null : d.getTime();
  };

  const durationMins = (start, end) => {
    const s = toComparable(start);
    const e = toComparable(end);
    if (s === null || e === null || e < s) return null;
    return Math.round((e - s) / 60000);
  };
  const headsDuration = durationMins(form.heads_start_time, form.heads_end_time);
  const heartsDuration = durationMins(form.heads_end_time, form.hearts_end_time);
  const runDuration = durationMins(form.run_start_time, form.run_end_time);

  const fmtTime = (val) => {
    if (!val) return '—';
    if (val.length <= 5) return val; // time-only
    try {
      return new Date(val).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
    } catch { return val; }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />Run Timeline &amp; ABV Log
      </p>

      {/* Run Start — full datetime */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">{dateField.label}</Label>
          <div className="flex gap-1.5">
            <Input
              type="datetime-local"
              value={form[dateField.key] || ''}
              onChange={e => set(dateField.key, e.target.value)}
              className="text-sm"
            />
            <Button type="button" variant="outline" size="icon" className="shrink-0" title="Set to now" onClick={() => set(dateField.key, nowDateTimeLocal())}>
              <Timer className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* Cut timing — time only */}
        {timeFields.map(f => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}</Label>
            <div className="flex gap-1.5">
              <Input
                type="time"
                value={(form[f.key] || '').slice(0, 5)}
                onChange={e => set(f.key, e.target.value)}
                className="text-sm"
              />
              <Button type="button" variant="outline" size="icon" className="shrink-0" title="Set to now" onClick={() => set(f.key, nowTime())}>
                <Timer className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Duration summary */}
      {(headsDuration !== null || heartsDuration !== null || runDuration !== null) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {headsDuration !== null && (
            <span className="bg-muted px-2 py-1 rounded">Heads: <span className="font-semibold">{headsDuration} min</span></span>
          )}
          {heartsDuration !== null && (
            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded">Hearts: <span className="font-semibold">{heartsDuration} min</span></span>
          )}
          {runDuration !== null && (
            <span className="bg-primary/5 text-primary px-2 py-1 rounded">Total run: <span className="font-semibold">{runDuration} min</span></span>
          )}
        </div>
      )}

      {/* ABV readings throughout the day */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <Label className="text-xs">ABV Readings Throughout the Day</Label>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5" onClick={addReading}>
            <Plus className="w-3.5 h-3.5" /> Add Reading
          </Button>
        </div>
        {(!form.abv_readings || form.abv_readings.length === 0) ? (
          <p className="text-xs text-muted-foreground py-2">No readings recorded yet. Add a reading each time you take an ABV measurement.</p>
        ) : (
          <div className="space-y-2">
            {(form.abv_readings || []).map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_2fr_auto] gap-2 items-end p-2 rounded-md border border-border bg-muted/20">
                <div>
                  <Label className="text-xs">Time</Label>
                  <Input
                    type="time"
                    value={(r.time || '').slice(0, 5)}
                    onChange={e => updateReading(i, 'time', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">ABV %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={r.abv || ''}
                    onChange={e => updateReading(i, 'abv', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Temp (°C)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={r.temp || ''}
                    onChange={e => updateReading(i, 'temp', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={r.notes || ''}
                    onChange={e => updateReading(i, 'notes', e.target.value)}
                    placeholder="e.g. first drops, cloudy, clear…"
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removeReading(i)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compact timeline view (read-only, for completed runs) */}
      {form.run_start_time && (
        <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
          Started {new Date(form.run_start_time).toLocaleString('en-NZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {form.run_end_time && ` · finished ${fmtTime(form.run_end_time)}`}
        </div>
      )}
    </div>
  );
}