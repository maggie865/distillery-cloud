-- Bulk customer CSV import (e.g. a Xero contacts export) needs to accept
-- rows that have no address at all - many real contact lists have
-- suppliers, individuals, or partial records without one. The manual
-- "Add Customer" form in the app still requires an address in its own UI
-- validation; this only relaxes the database-level constraint so imports
-- of otherwise-good contact data don't get silently dropped.

alter table public.customer alter column delivery_address drop not null;
