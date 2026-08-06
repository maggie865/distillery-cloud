-- Initial schema for the distillery operations app.
--
-- The app (src/api/supabaseClient.js) does generic CRUD against snake_case
-- table names derived from its JS entity names (e.g. FinishedGood ->
-- finished_good), with no schema behind them yet - this migration creates
-- that schema.
--
-- Design notes (see PR description for the full reasoning):
--  * Every table uses `id uuid primary key default gen_random_uuid()` and
--    `created_at timestamptz not null default now()` - the app's generic
--    list() wrapper defaults to ordering by created_at even when a page
--    passes its own orderBy.
--  * Status/type/action fields are plain `text`, NOT constrained with CHECK
--    or enum types. The frontend was reverse-engineered from its React
--    forms, and an incomplete enum list would silently block real writes in
--    production - safer to leave these open and tighten later once verified
--    against real usage.
--  * Only relationships confirmed to hold real UUIDs referencing another
--    table's id got a hard foreign key. Several relationships in the app are
--    "soft" - matched by business-key strings like batch_number or tank
--    name rather than by id (see comments below) - those are left as plain
--    indexed text columns, matching current app behavior, rather than
--    invented FKs that could reject real inserts.
--  * RLS: this is a single-tenant internal tool gated by Google sign-in
--    restricted to one Workspace domain (see AuthContext.jsx +
--    20260806013000_restrict_signup_to_org_domain.sql) - there's no
--    per-user ownership model in any of these entities, so every table gets
--    one blanket "any authenticated user" policy. If you want role-based
--    restrictions later (e.g. only admins can delete), that needs auth.uid()
--    lookups against user role and is a separate follow-up.
--  * anon gets no access at all - every table requires a signed-in session.

-- ── Lookup / independent tables ────────────────────────────────────────────

create table public.supplier (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  address text not null,
  contact_email text,
  contact_phone text,
  goods_types text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
create index supplier_business_name_idx on public.supplier (business_name);

create table public.customer (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  delivery_address text not null,
  xero_contact_id text,
  created_at timestamptz not null default now()
);
create index customer_business_name_idx on public.customer (business_name);

-- name is the natural key used throughout the app (tank.name, joined by
-- string in tank_movement etc.) - kept unique so future FKs to it are safe.
create table public.storage_tank (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity_litres numeric not null,
  purpose text not null default 'final_product_storage',
  location text not null default 'indoor',
  status text not null default 'empty',
  current_volume numeric not null default 0,
  current_abv numeric,
  current_product text,
  current_batch text,
  is_ready_for_bottling boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create unique index storage_tank_name_key on public.storage_tank (name);
create index storage_tank_purpose_status_idx on public.storage_tank (purpose, status);

create table public.recipe (
  id uuid primary key default gen_random_uuid(),
  recipe_type text not null default 'spirit',
  name text not null,
  description text,
  base_ethanol_volume numeric,
  base_ethanol_abv numeric,
  bottles_per_case integer,
  ingredients jsonb not null default '[]',
  packaging jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now()
);
create index recipe_name_idx on public.recipe (name);

create table public.master_batch (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null,
  product_name text not null,
  date_started date not null,
  date_completed date,
  status text not null default 'in_progress',
  target_volume numeric,
  target_abv numeric,
  holding_tank text,
  distillation_run_count integer,
  total_output_lals numeric,
  ethanol_lot text,
  notes text,
  created_at timestamptz not null default now()
);
create unique index master_batch_batch_code_key on public.master_batch (batch_code);
create index master_batch_date_started_idx on public.master_batch (date_started desc);

-- Generic key/value store - used by Settings/Checklists/WasteTracker for
-- everything from single values (image URLs, running counters) to whole
-- JSON blobs (checklist templates, checklist run history).
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value jsonb,
  created_at timestamptz not null default now()
);
create unique index app_settings_key_key on public.app_settings (key);

create table public.dashboard_link (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  path text not null,
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index dashboard_link_sort_order_idx on public.dashboard_link (sort_order);

create table public.pest_control_trap (
  id uuid primary key default gen_random_uuid(),
  trap_id text not null,
  trap_type text not null default 'bait_station',
  location_description text,
  location_x numeric not null default 50,
  location_y numeric not null default 50,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now()
);
create unique index pest_control_trap_trap_id_key on public.pest_control_trap (trap_id);

-- ── Receiving / raw materials ──────────────────────────────────────────────

create table public.receiving (
  id uuid primary key default gen_random_uuid(),
  material_name text not null,
  material_type text not null,
  quantity numeric not null,
  unit text not null,
  abv_percent numeric,
  lals numeric,
  supplier_id uuid references public.supplier (id) on delete set null,
  supplier_name text,
  transport_distance_km numeric,
  transport_method text default 'road',
  weight_kg numeric,
  co2e_kg numeric,
  cost_per_unit numeric,
  batch_number text,
  packing_slip_number text,
  date_received date not null,
  notes text,
  packing_slip_url text,
  created_at timestamptz not null default now()
);
create index receiving_date_received_idx on public.receiving (date_received desc);
create index receiving_material_type_idx on public.receiving (material_type);
create index receiving_supplier_id_idx on public.receiving (supplier_id);

create table public.raw_material (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  quantity numeric not null default 0,
  unit text not null default 'litres',
  abv_percent numeric,
  lals numeric,
  supplier text,
  cost_per_unit numeric,
  batch_number text,
  notes text,
  date_received date,
  receiving_id uuid references public.receiving (id) on delete set null,
  lots jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index raw_material_name_idx on public.raw_material (name);
create index raw_material_type_idx on public.raw_material (type);
create index raw_material_receiving_id_idx on public.raw_material (receiving_id);

create table public.stock_threshold (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid references public.raw_material (id) on delete cascade,
  material_name text not null,
  threshold numeric not null,
  unit text,
  created_at timestamptz not null default now()
);
create index stock_threshold_raw_material_id_idx on public.stock_threshold (raw_material_id);
create index stock_threshold_material_name_idx on public.stock_threshold (material_name);

-- ── Production: distillation, dilution, batches ────────────────────────────

create table public.sub_batch (
  id uuid primary key default gen_random_uuid(),
  master_batch_id uuid references public.master_batch (id) on delete cascade,
  master_batch_code text not null,
  sub_batch_code text not null,
  date date,
  input_volume numeric,
  input_abv numeric,
  maceration_date date,
  maceration_notes text,
  status text not null default 'planned',
  botanical_lots text,
  ethanol_lot text,
  notes text,
  created_at timestamptz not null default now()
);
create index sub_batch_master_batch_id_idx on public.sub_batch (master_batch_id);
create index sub_batch_master_batch_code_idx on public.sub_batch (master_batch_code);
create index sub_batch_sub_batch_code_idx on public.sub_batch (sub_batch_code);
create index sub_batch_date_idx on public.sub_batch (date desc);

-- batch_number/sub_batch_code below are matched against master_batch/
-- sub_batch by business-key string, not by uuid - left as plain text (see
-- migration header note on soft relationships).
create table public.distillation_run (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null,
  date date not null,
  product_name text not null,
  sub_batch_code text,
  ethanol_lot_code text,
  source_tank_allocations jsonb not null default '[]',
  maceration_date date,
  maceration_notes text,
  input_volume numeric,
  input_abv numeric,
  input_lals numeric,
  atmospheric_pressure numeric,
  still_temp numeric,
  run_start_time text,
  run_end_time text,
  heads_start_time text,
  heads_end_time text,
  hearts_end_time text,
  tails_end_time text,
  abv_readings jsonb not null default '[]',
  heads_volume numeric,
  heads_abv numeric,
  heads_lals numeric,
  hearts_volume numeric,
  hearts_abv numeric,
  hearts_lals numeric,
  tails_volume numeric,
  tails_abv numeric,
  tails_lals numeric,
  dumped_volume numeric,
  dumped_abv numeric,
  dumped_lals numeric,
  dumped_notes text,
  destination_tank_id uuid references public.storage_tank (id) on delete set null,
  output_volume numeric,
  output_abv numeric,
  output_lals numeric,
  status text not null default 'planned',
  notes text,
  created_at timestamptz not null default now()
);
create index distillation_run_date_idx on public.distillation_run (date desc);
create index distillation_run_batch_number_idx on public.distillation_run (batch_number);
create index distillation_run_status_idx on public.distillation_run (status);
create index distillation_run_destination_tank_id_idx on public.distillation_run (destination_tank_id);

create table public.sns_run (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  source_tank_id uuid references public.storage_tank (id) on delete set null,
  destination_tank_ids jsonb not null default '[]',
  input_volume numeric,
  input_abv numeric,
  hearts_volume numeric not null,
  hearts_abv numeric not null,
  hearts_lals numeric,
  dumped_volume numeric default 0,
  dumped_abv numeric default 0,
  dumped_lals numeric default 0,
  dumped_notes text,
  status text not null default 'completed',
  notes text,
  created_at timestamptz not null default now()
);
create index sns_run_date_idx on public.sns_run (date desc);
create index sns_run_source_tank_id_idx on public.sns_run (source_tank_id);

-- No discrete type column - the app currently distinguishes ethanol vs
-- heads/hearts dilutions by a tag embedded in `notes`
-- ("[Ethanol Dilution]" / "[Heads Dilution]"). Left as-is to match current
-- app behavior; worth a follow-up to add a real dilution_type column.
create table public.dilution (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null,
  date date not null,
  input_ethanol_volume numeric not null,
  input_abv numeric not null,
  input_lals numeric,
  water_added numeric default 0,
  output_volume numeric,
  output_abv numeric,
  output_lals numeric,
  status text not null default 'completed',
  notes text,
  created_at timestamptz not null default now()
);
create index dilution_date_idx on public.dilution (date desc);
create index dilution_batch_number_idx on public.dilution (batch_number);

-- ── Bottling, finished goods, warehouse, tanks ─────────────────────────────

create table public.bottling_run (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null,
  product_name text not null,
  date date not null,
  input_volume numeric not null,
  input_abv numeric not null,
  input_lals numeric,
  bottle_size_ml integer not null,
  bottles_produced integer not null,
  bottles_per_case integer,
  lals_per_bottle numeric,
  status text not null default 'planned',
  packaging_costs jsonb not null default '[]',
  recipe_id uuid references public.recipe (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index bottling_run_date_idx on public.bottling_run (date desc);
create index bottling_run_batch_number_idx on public.bottling_run (batch_number);
create index bottling_run_recipe_id_idx on public.bottling_run (recipe_id);

-- product_name/batch_number/bottle_size_ml form the natural key the app
-- matches records by everywhere (see migration header note).
create table public.finished_good (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  batch_number text not null,
  bottle_size_ml integer not null,
  abv_percent numeric,
  quantity_bottles integer not null default 0,
  total_lals numeric,
  bottles_per_case integer,
  is_tasting boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index finished_good_natural_key_idx on public.finished_good (product_name, batch_number, bottle_size_ml);

create table public.warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  batch_number text not null,
  bottle_size_ml integer not null,
  abv_percent numeric,
  quantity_bottles integer not null default 0,
  total_lals numeric,
  original_quantity_bottles integer,
  original_total_lals numeric,
  warehouse_location text default 'Auckland 3PL',
  date_transferred_in date,
  transfer_date date,
  received_date date,
  co2e_kg numeric,
  transport_distance_km numeric,
  packing_slip_number text,
  bottles_per_case integer,
  status text default 'in_transit',
  notes text,
  created_at timestamptz not null default now()
);
create index warehouse_stock_natural_key_idx on public.warehouse_stock (product_name, batch_number, bottle_size_ml);
create index warehouse_stock_transfer_date_idx on public.warehouse_stock (transfer_date desc);
create index warehouse_stock_status_idx on public.warehouse_stock (status);
create index warehouse_stock_packing_slip_number_idx on public.warehouse_stock (packing_slip_number);

-- tank_name/counterpart_tank are matched against storage_tank.name by string
-- throughout the app, not by uuid FK (see migration header note) - this is
-- the highest-volume audit-log table (every fill/transfer/draw/clean event).
create table public.tank_movement (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  action text not null,
  tank_name text not null,
  counterpart_tank text,
  volume_litres numeric not null default 0,
  abv numeric,
  lals numeric,
  product text,
  batch_number text,
  ethanol_lot text,
  botanical_lot text,
  operator text,
  notes text,
  created_at timestamptz not null default now()
);
create index tank_movement_date_idx on public.tank_movement (date desc);
create index tank_movement_tank_name_idx on public.tank_movement (tank_name);
create index tank_movement_batch_number_idx on public.tank_movement (batch_number);
create index tank_movement_action_idx on public.tank_movement (action);

-- run_id is polymorphic (sns_run.id or distillation_run.id depending on
-- `source`) - no single FK target, left unconstrained but indexed.
create table public.wastage_record (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  batch_number text,
  product_name text not null default 'SNS Run',
  volume numeric not null,
  abv numeric not null,
  lals numeric,
  reason text not null default 'SNS still waste',
  source text not null,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index wastage_record_date_idx on public.wastage_record (date desc);
create index wastage_record_source_idx on public.wastage_record (source);
create index wastage_record_run_id_idx on public.wastage_record (run_id);
create index wastage_record_batch_number_idx on public.wastage_record (batch_number);

-- ── Sales / dispatch ────────────────────────────────────────────────────────

-- customer_name/product_name/batch_number are denormalized strings, not FKs
-- to customer/finished_good (see migration header note) - matches current
-- app behavior, which re-looks-up by these strings rather than storing ids.
create table public.dispatch (
  id uuid primary key default gen_random_uuid(),
  dispatch_date date not null,
  customer_name text not null,
  customer_address text,
  product_name text not null,
  batch_number text not null,
  bottle_size_ml integer not null,
  quantity_bottles integer not null,
  total_lals numeric not null,
  parcel_weight_kg numeric,
  transport_distance_km numeric,
  transport_method text not null default 'road',
  co2e_kg numeric,
  dispatched_from text default 'Bluff',
  status text not null default 'dispatched',
  sales_channel text default 'wholesale',
  order_reference text,
  sample_dispatch boolean not null default false,
  duty_free boolean not null default false,
  is_export boolean not null default false,
  notes text,
  xero_invoice_id text,
  created_at timestamptz not null default now()
);
create index dispatch_dispatch_date_idx on public.dispatch (dispatch_date desc);
create index dispatch_customer_name_idx on public.dispatch (customer_name);
create index dispatch_status_idx on public.dispatch (status);

-- ── Stock takes ─────────────────────────────────────────────────────────────

create table public.stock_take (
  id uuid primary key default gen_random_uuid(),
  date date not null default (now() at time zone 'utc')::date,
  conducted_by text,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now()
);
create index stock_take_date_idx on public.stock_take (date desc);

create table public.stock_take_line (
  id uuid primary key default gen_random_uuid(),
  stock_take_id uuid not null references public.stock_take (id) on delete cascade,
  item_type text not null,
  raw_material_id uuid references public.raw_material (id) on delete set null,
  finished_good_id uuid references public.finished_good (id) on delete set null,
  tank_id uuid references public.storage_tank (id) on delete set null,
  material_name text not null,
  batch_number text,
  bottle_size_ml integer,
  unit text not null,
  system_quantity numeric not null,
  -- null = not yet counted, distinct from 0 = counted as empty. Do not
  -- default this to 0.
  counted_quantity numeric,
  variance numeric,
  notes text,
  created_at timestamptz not null default now()
);
create index stock_take_line_stock_take_id_idx on public.stock_take_line (stock_take_id);
create index stock_take_line_raw_material_id_idx on public.stock_take_line (raw_material_id);
create index stock_take_line_finished_good_id_idx on public.stock_take_line (finished_good_id);
create index stock_take_line_tank_id_idx on public.stock_take_line (tank_id);

-- ── Compliance: food recall, maintenance, pest control, temperature ────────

create table public.food_recall (
  id uuid primary key default gen_random_uuid(),
  recall_number text not null,
  product_name text not null,
  batch_numbers text,
  date_initiated date not null,
  reason_type text,
  reason_detail text,
  recall_level text,
  status text default 'investigating',
  bottles_affected integer,
  bottles_recovered integer,
  mpi_notified_at timestamptz,
  mpi_case_officer text,
  distribution_list text,
  corrective_actions text,
  step1_notes text,
  step2_notes text,
  step3_notes text,
  step4_notes text,
  step5_notes text,
  step6_notes text,
  notes text,
  created_at timestamptz not null default now()
);
create index food_recall_date_initiated_idx on public.food_recall (date_initiated desc);

create table public.mock_recall (
  id uuid primary key default gen_random_uuid(),
  recall_number text not null,
  product_name text not null,
  batch_numbers text,
  date_conducted date not null,
  reason_type text,
  reason_detail text,
  recall_level text,
  status text default 'investigating',
  bottles_affected integer,
  bottles_recovered integer,
  mpi_notified_at timestamptz,
  mpi_case_officer text,
  distribution_list text,
  corrective_actions text,
  step1_notes text,
  step2_notes text,
  step3_notes text,
  step4_notes text,
  step5_notes text,
  step6_notes text,
  scenario text,
  conducted_by text,
  time_to_complete_mins integer,
  distribution_list_accurate boolean,
  stock_located boolean,
  mpi_contact_identified boolean,
  outcome text,
  next_mock_due date,
  notes text,
  created_at timestamptz not null default now()
);
create index mock_recall_date_conducted_idx on public.mock_recall (date_conducted desc);

create table public.maintenance_record (
  id uuid primary key default gen_random_uuid(),
  maintenance_type text not null,
  date date not null,
  equipment_name text,
  check_item_name text,
  performed_by text,
  result text,
  status text default 'completed',
  requires_followup boolean default false,
  notes text,
  description text,
  next_due_date date,
  certifier_company text,
  inspector_name text,
  certificate_number text,
  check_springs text,
  wash_abv numeric,
  alcohol_condition text,
  filter_cleaned boolean,
  created_at timestamptz not null default now()
);
create index maintenance_record_date_idx on public.maintenance_record (date desc);
create index maintenance_record_type_date_idx on public.maintenance_record (maintenance_type, date desc);

create table public.pest_control_log (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  trap_id text references public.pest_control_trap (trap_id) on delete set null,
  activity text not null,
  pest_type text,
  quantity integer,
  bait_used text,
  inspected_by text,
  notes text,
  created_at timestamptz not null default now()
);
create index pest_control_log_date_idx on public.pest_control_log (date desc);
create index pest_control_log_trap_id_idx on public.pest_control_log (trap_id);

create table public.temperature_log (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time text,
  unit_name text not null,
  unit_type text not null,
  temperature_c numeric not null,
  min_safe_c numeric not null,
  max_safe_c numeric not null,
  recorded_by text,
  in_range boolean not null,
  corrective_action text,
  created_at timestamptz not null default now()
);
create index temperature_log_unit_date_idx on public.temperature_log (unit_name, date desc);

create table public.whiskey_barrel (
  id uuid primary key default gen_random_uuid(),
  barrel_number text not null,
  product_name text not null,
  barrel_type text default 'ex-bourbon',
  previous_use text default 'first_fill',
  capacity_litres numeric default 200,
  volume_litres numeric default 200,
  abv_percent numeric,
  fill_date date,
  cooperage text,
  owner text,
  location_description text,
  status text default 'maturing',
  last_checked_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index whiskey_barrel_fill_date_idx on public.whiskey_barrel (fill_date desc);
create index whiskey_barrel_barrel_number_idx on public.whiskey_barrel (barrel_number);

create table public.utility_log (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  reading_date date not null,
  electricity_kwh numeric,
  water_litres numeric,
  electricity_cost numeric,
  water_cost numeric,
  notes text,
  created_at timestamptz not null default now()
);
create index utility_log_reading_date_idx on public.utility_log (reading_date desc);

-- ── RLS: every table requires a signed-in (org-domain-restricted) user ─────
-- No per-row ownership model exists in this app - see migration header note.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'supplier', 'customer', 'storage_tank', 'recipe', 'master_batch',
      'app_settings', 'dashboard_link', 'pest_control_trap', 'receiving',
      'raw_material', 'stock_threshold', 'sub_batch', 'distillation_run',
      'sns_run', 'dilution', 'bottling_run', 'finished_good',
      'warehouse_stock', 'tank_movement', 'wastage_record', 'dispatch',
      'stock_take', 'stock_take_line', 'food_recall', 'mock_recall',
      'maintenance_record', 'pest_control_log', 'temperature_log',
      'whiskey_barrel', 'utility_log'
    ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
