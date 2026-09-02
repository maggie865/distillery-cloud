-- Needed to calculate still electricity/water use for EMS reporting (see
-- src/lib/stillEnergy.js). distillation_run already has a full run timeline
-- (run_start_time/run_end_time + cut times); sns_run has none, so duration
-- can't be computed for SNS runs without these. Same convention as
-- distillation_run: run_start_time is a full datetime, run_end_time is
-- time-only and anchored to run_start_time's date.
--
-- dephlegmator_water_litres is a real monitored reading (the dephlegmator's
-- cooling water is genuine consumption, not recirculated like the
-- condenser) - left nullable so it can be entered after the run from a
-- water meter; the app estimates from the rated flow rate until it is.
alter table public.sns_run
  add column run_start_time text,
  add column run_end_time text,
  add column dephlegmator_water_litres numeric;
