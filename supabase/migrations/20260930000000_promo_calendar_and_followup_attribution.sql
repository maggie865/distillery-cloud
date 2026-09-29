-- Sales Rep portal, round 2: promo calendar + follow-up attribution for
-- in-app "your follow-up is due" notifications.

-- ── Follow-up attribution ───────────────────────────────────────────────────
-- customer_activity.recorded_by is free text (a display name at the time of
-- logging) — fine for the timeline, but not reliable enough to match "this
-- follow-up belongs to this login" for notifications (typos, name changes,
-- two people sharing a similar name). This is a real reference instead, set
-- by LogVisitDialog/LogContactDialog at creation time.
alter table public.customer_activity add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists customer_activity_created_by_user_id_idx on public.customer_activity (created_by_user_id);

-- ── Promo calendar — shared across the sales team ───────────────────────────
create table public.promo_event (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null default 'promotion' check (event_type in ('promotion', 'activation', 'tasting', 'other')),
  start_date date not null,
  end_date date,
  location text,
  customer_id uuid references public.customer(id) on delete set null,
  product_name text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index promo_event_start_date_idx on public.promo_event (start_date);
create index promo_event_customer_id_idx on public.promo_event (customer_id);

alter table public.promo_event enable row level security;

-- Same permissive shape used throughout this app for shared/team-managed
-- tables (see e.g. environmental_aspect, customer_group) — anyone signed in
-- who reaches the page (gated separately by page_permission below) can
-- read/add/edit/delete any event, since this is a shared team calendar, not
-- personal data.
create policy promo_event_all on public.promo_event
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.promo_event to authenticated;

-- ── Page access ──────────────────────────────────────────────────────────────
insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('promo-calendar', 'Promo Calendar', '/promo-calendar', '{admin,sales_rep}')
on conflict (page_key) do nothing;
