-- Dashboard "Log New Customer Visit" flow creates a customer record with
-- only a store name, contact person, and phone/email up front - no address
-- yet, since that gets filled in properly later once they're a real
-- account. delivery_address was previously required at signup time
-- (originally added for carbon-report distance calcs), which this flow
-- can't satisfy - relax it to optional here instead.
alter table public.customer alter column delivery_address drop not null;
