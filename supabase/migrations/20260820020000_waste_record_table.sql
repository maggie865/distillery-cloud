-- Waste Tracker has stored every waste entry as one JSON blob in
-- app_settings (key 'waste_records') since it was first built - convenient
-- at the time (no dedicated table needed), but a real gap: every save does
-- a full read-modify-write of the whole blob, so two people logging waste
-- around the same time can silently clobber each other's entry (last write
-- wins). This gives waste records a real table instead, with per-row writes.
--
-- Not to be confused with public.wastage_record, an unrelated pre-existing
-- table for spirit-loss/dumped-batch tracking (batch_number/volume/abv/lals)
-- - different domain entirely, left untouched.

create table public.waste_record (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null,
  bin_size_litres numeric,
  bins_count numeric,
  litres numeric,
  kg numeric,
  notes text,
  recorded_by text,
  created_at timestamptz not null default now()
);
create index waste_record_date_idx on public.waste_record (date);

alter table public.waste_record enable row level security;
create policy waste_record_authenticated_all on public.waste_record
  for all to authenticated using (true) with check (true);
revoke all on public.waste_record from anon;
grant select, insert, update, delete on public.waste_record to authenticated;

-- One-off backfill from the existing JSON blob, if one exists. The blob is
-- double-encoded (a JSON string stored inside a jsonb column - `value #>> '{}'`
-- unwraps the outer jsonb-string layer before parsing the array inside it).
insert into public.waste_record (date, category, bin_size_litres, bins_count, litres, kg, notes, recorded_by, created_at)
select
  (elem->>'date')::date,
  elem->>'category',
  nullif(elem->>'bin_size_litres','')::numeric,
  nullif(elem->>'bins_count','')::numeric,
  nullif(elem->>'litres','')::numeric,
  nullif(elem->>'kg','')::numeric,
  elem->>'notes',
  elem->>'recorded_by',
  coalesce((elem->>'created_at')::timestamptz, now())
from public.app_settings s,
     jsonb_array_elements((s.value #>> '{}')::jsonb) elem
where s.key = 'waste_records';
