-- Links the product catalog (added in 20260812010000) to production:
-- recipe -> product/base-recipe, finished_good -> product, plus structured
-- per-ingredient lot tracking for distillation runs.
--
-- Everything here is additive/nullable - no existing row shape changes.
-- Bottle size on a packaging-type recipe was previously only inferable by
-- regex-parsing the recipe's name (e.g. "Bluff Gin 700ml" -> 700); this
-- gives it a real column instead. base_recipe_id/product_id turn what were
-- previously name-string-matched relationships (BottlingFloor.jsx,
-- useRawMaterialsNetStock.js) into real FKs, without touching the
-- name-matching that finished_good/dispatch/warehouse_stock already use
-- amongst themselves (out of scope here, unrelated blast radius).

alter table public.recipe
  add column bottle_size_ml integer,
  add column base_recipe_id uuid references public.recipe (id) on delete set null,
  add column product_id uuid references public.product (id) on delete set null;
create index recipe_base_recipe_id_idx on public.recipe (base_recipe_id);
create index recipe_product_id_idx on public.recipe (product_id);

alter table public.finished_good add column product_id uuid references public.product (id) on delete set null;
create index finished_good_product_id_idx on public.finished_good (product_id);

-- Structured per-ingredient lot consumption for a distillation run - same
-- rigor distillation_run.ethanol_lot_code already gave ethanol, extended to
-- every ingredient (including ethanol itself, since its FIFO depletion can
-- already span multiple physical lots that only the top-level
-- ethanol_lot_code column never captured). Additive alongside the existing
-- sub_batch.botanical_lots free-text summary, which keeps being written
-- unchanged - FoodRecall.jsx and ImportDataPanel.jsx depend on its exact
-- shape and are out of scope for this change.
create table public.distillation_run_lot_usage (
  id uuid primary key default gen_random_uuid(),
  distillation_run_id uuid not null references public.distillation_run (id) on delete cascade,
  raw_material_id uuid references public.raw_material (id) on delete set null,
  raw_material_name text not null,
  ingredient_role text not null default 'botanical', -- 'botanical' | 'ethanol'
  lot_number text,
  quantity_consumed numeric not null,
  unit text,
  created_at timestamptz not null default now()
);
create index distillation_run_lot_usage_run_idx on public.distillation_run_lot_usage (distillation_run_id);
create index distillation_run_lot_usage_rm_idx on public.distillation_run_lot_usage (raw_material_id);

alter table public.distillation_run_lot_usage enable row level security;
create policy distillation_run_lot_usage_authenticated_all on public.distillation_run_lot_usage
  for all to authenticated using (true) with check (true);
revoke all on public.distillation_run_lot_usage from anon;
grant select, insert, update, delete on public.distillation_run_lot_usage to authenticated;
