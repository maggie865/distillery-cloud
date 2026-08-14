-- Quick Order creates a dispatch row before a specific production batch has
-- been picked (batch_number is only assigned later, via FIFO, when the row
-- transitions to 'dispatched' -- see DispatchHub.jsx's
-- allocateBluffBatchForDispatch and QuickOrderModal.jsx). The app code was
-- built around batch_number being nullable for that pending window, but
-- this NOT NULL constraint (from the original schema, predating Quick
-- Order) was never relaxed to match -- every Quick Order has been failing
-- to create its dispatch rows because of it.

alter table public.dispatch alter column batch_number drop not null;
