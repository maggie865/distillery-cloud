-- Lets a planned run be linked to the real run record it became, so the
-- Production Planner can show what's actually happening (the real record's
-- own status - e.g. distillation_run already has a richer planned ->
-- macerating -> distilling -> completed lifecycle of its own) instead of
-- just the plan's own coarse planned/in_progress/completed/cancelled state.
-- No FK constraint - which table linked_run_id points into depends on
-- linked_run_type (distillation_run / dilution / bottling_run / sns_run),
-- so this is a soft reference resolved in the app, same reasoning as
-- wastage_record.run_id.
alter table public.production_plan add column linked_run_id uuid;
alter table public.production_plan add column linked_run_type text;
