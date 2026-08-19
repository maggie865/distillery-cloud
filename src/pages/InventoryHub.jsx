import NavGroupHub from '@/components/shared/NavGroupHub';

// Descriptions for Inventory-group tiles — see Compliance.jsx for the
// same pattern. Named InventoryHub (not Inventory) to avoid colliding
// with the existing Finished Goods page component, which is itself one
// of this hub's tiles.
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
      title="Inventory"
      subtitle="Stock, receiving, and warehousing"
      navGroup="Inventory"
      ownKey="inventory-hub"
      descriptions={DESCRIPTIONS}
    />
  );
}
