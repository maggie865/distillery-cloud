// Shared vocabulary for tank_movement.action across the Tank Detail tabs.
// Mirrors the ACTION_LABELS/ACTION_COLORS already used on the Tanks page,
// extended with the log-only actions this page introduces (measurement,
// note) plus the maintenance/cleaning markers TankCard already writes.

export const ACTION_LABELS = {
  fill: 'Volume added (fill)',
  empty: 'Tank emptied',
  transfer_in: 'Product transferred in',
  transfer_out: 'Product transferred out',
  bottling_draw: 'Drawn for bottling',
  adjust: 'Volume adjusted',
  cleaning: 'Cleaning started',
  cleaning_complete: 'Cleaning complete',
  maintenance_start: 'Maintenance started',
  maintenance_complete: 'Maintenance complete',
  measurement: 'Measurement recorded',
  note: 'Note added',
  status_change: 'Status changed',
  ready: 'Marked ready',
};

export const ACTION_COLORS = {
  fill: 'bg-success/10 text-success',
  empty: 'bg-destructive/10 text-destructive',
  transfer_in: 'bg-info/10 text-info',
  transfer_out: 'bg-warning/10 text-warning',
  bottling_draw: 'bg-primary/10 text-primary',
  adjust: 'bg-info/10 text-info',
  cleaning: 'bg-warning/10 text-warning',
  cleaning_complete: 'bg-success/10 text-success',
  maintenance_start: 'bg-destructive/10 text-destructive',
  maintenance_complete: 'bg-success/10 text-success',
  measurement: 'bg-muted text-muted-foreground',
  note: 'bg-muted text-muted-foreground',
  status_change: 'bg-info/10 text-info',
  ready: 'bg-success/10 text-success',
};
