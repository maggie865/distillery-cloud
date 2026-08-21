-- The nav label for /inventory ("Finished Goods") didn't match what the
-- page itself already displays ("Inventory" - see its own PageHeader).
-- Freed up "Inventory" for that page by renaming the group hub tile
-- (previously also "Inventory") to "Stock" - see pages.js for the
-- corresponding label/navGroup changes. page_permission.label is a
-- separate copy from pages.js (read directly by the Permissions matrix
-- UI), so it needs updating here to stay in sync.
update public.page_permission set label = 'Inventory' where page_key = 'inventory';
update public.page_permission set label = 'Stock' where page_key = 'inventory-hub';
