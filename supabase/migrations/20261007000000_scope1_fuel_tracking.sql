-- Scope 1 (direct) emissions were entirely missing from the EMS — utility_log
-- only ever captured mains electricity (Scope 2) and town water (Scope 3).
-- Adds the two Scope 1 sources Bluff actually has: LPG for kitchen hot water
-- (stationary combustion) and company vehicle fuel (mobile combustion).
-- Logged on the same utility_log reading rather than a new table, so one
-- period's bill/odometer entry covers every utility at once.
alter table public.utility_log
  add column lpg_kg numeric,
  add column lpg_cost numeric,
  add column vehicle_fuel_type text check (vehicle_fuel_type in ('petrol', 'diesel')),
  add column vehicle_fuel_litres numeric,
  add column vehicle_fuel_cost numeric;

-- Lets an Objective & Target be set against either new Scope 1 metric, the
-- same way one can already be set against electricity/water today.
alter table public.environmental_objective drop constraint environmental_objective_utility_metric_check;
alter table public.environmental_objective add constraint environmental_objective_utility_metric_check
  check (utility_metric in ('electricity_kwh', 'water_litres', 'electricity_cost', 'water_cost', 'lpg_kg', 'lpg_cost', 'vehicle_fuel_litres', 'vehicle_fuel_cost'));
