-- Removes page_permission rows for pages that no longer exist in the app:
-- - bottling, raw-materials: orphaned legacy duplicates of bottling-floor
--   and receiving/inventory, deleted outright (not linked from any nav,
--   confirmed unused).
-- - batch-tracker: folded into Reports as a new "Batch Trace" tab rather
--   than staying a standalone page, since it's a read-only cross-functional
--   traceability view, not a distinct workflow.
delete from public.page_permission
where page_key in ('bottling', 'raw-materials', 'batch-tracker');
