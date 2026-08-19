-- Packaging emissions: closes the last untracked lifecycle stage flagged
-- in LifecycleReport.jsx. Packaging items are already RawMaterial rows
-- (type = 'packaging') — rather than a new table, this adds an editable
-- carbon factor and a certifications list directly onto that existing
-- row, the same place cost_per_unit already lives for these items.

alter table public.raw_material
  add column if not exists emission_factor_kg_co2e numeric,
  add column if not exists certifications jsonb not null default '[]';
