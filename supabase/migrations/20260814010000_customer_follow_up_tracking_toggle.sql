-- Not every customer should generate "visit overdue" / "no recent contact"
-- nagging on the Needs Attention list -- a one-time purchaser or an
-- inconsistent buyer doesn't need an active relationship-management
-- cadence the way a regular wholesale account does. This is a per-customer
-- opt-out of that automatic cadence tracking, defaulting to on (existing
-- behaviour unchanged for everyone until someone explicitly turns it off).
-- It does NOT hide explicit action items (an overdue follow-up task or an
-- open request the user deliberately logged) -- only the ambient
-- visit/contact cadence checks in computeCustomerStats.

alter table public.customer add column follow_up_tracking_enabled boolean not null default true;
