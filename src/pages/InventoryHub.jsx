import NavGroupHub from '@/components/shared/NavGroupHub';

// Descriptions for Stock-group tiles — see Compliance.jsx for the same
// pattern. Named InventoryHub (not Stock) since it predates the group's
// rename from "Inventory" to "Stock" - the nav label freed up "Inventory"
// for its own Finished Goods tile (see pages.js), so the group itself
// became "Stock" instead. Left the component/key/path as-is; only the
// user-facing labels changed.
const DESCRIPTIONS = {
  'inventory': 'Finished goods stock levels',
  'warehouse': '3PL warehouse stock and transfers',
  'receiving': 'Log incoming raw materials and ethanol',
  'stock-takes': 'Physical stock count reconciliation',
  'whiskey-barrels': 'Cask inventory and maturation tracking',
};

export default function InventoryHub() {
  return (
    <NavGroupHub
      title="Stock"
      subtitle="Stock, receiving, and warehousing"
      navGroup="Stock"
      ownKey="inventory-hub"
      descriptions={DESCRIPTIONS}
    />
  );
}
