/**
 * src/lib/settingsNav.js — single source of truth for the Settings section's
 * category tree, mirroring the role pages.js plays for the main app nav.
 *
 * Every item maps to functionality that already exists in the app:
 *  - kind: 'embed'  → rendered inline via `component`.
 *  - kind: 'link'   → functionality lives on its own operational page;
 *    shown as a "go to X" card via `path` rather than duplicated here.
 *
 * Deliberately NOT included: anything the app has no real settings for yet
 * (e.g. notification preferences, KPI preferences, a standalone "Products"
 * concept, cleaning schedules, excise/documentation config). Inventing
 * placeholder controls for those would violate the "don't create dummy
 * settings" requirement this structure was built against.
 */
import {
  User, Building2, Users, Cylinder, FlaskConical, Link2, Boxes, Truck, Upload,
  CheckSquare, Wrench, MapPin, ShieldCheck, LayoutDashboard, Database, Factory,
  Package, ClipboardList, Lock,
} from 'lucide-react';

import MyProfilePanel from '@/components/settings/MyProfilePanel';
import LocationSettings from '@/components/settings/LocationSettings';
import TanksEquipmentSettings from '@/components/settings/TanksEquipmentSettings';
import RecipeManager from '@/components/settings/RecipeManager';
import ProductLinksManager from '@/components/settings/ProductLinksManager';
import ImportDataPanel from '@/components/settings/ImportDataPanel';
import ChecklistManager from '@/components/settings/ChecklistManager';
import PestControlMapSettings from '@/components/settings/PestControlMapSettings';
import ComplianceSettings from '@/components/settings/ComplianceSettings';
import DashboardLinkManager from '@/components/settings/DashboardLinkManager';
import DataExportPanel from '@/components/settings/DataExportPanel';

export const SETTINGS_NAV = [
  {
    key: 'account',
    label: 'Account',
    icon: User,
    items: [
      { key: 'profile', label: 'My Profile', description: 'Your account details.', icon: User, kind: 'embed', component: MyProfilePanel },
      { key: 'organisation', label: 'Organisation', description: 'Distillery and warehouse addresses used across the app.', icon: Building2, kind: 'embed', component: LocationSettings },
      { key: 'users-team', label: 'Users & Team', description: 'Manage team access and roles.', icon: Users, kind: 'link', path: '/permissions', superAdminOnly: true },
    ],
  },
  {
    key: 'distillery',
    label: 'Distillery',
    icon: Factory,
    items: [
      { key: 'tanks', label: 'Tanks & Equipment', description: 'Manage tanks, capacities and equipment.', icon: Cylinder, kind: 'embed', component: TanksEquipmentSettings },
      { key: 'recipes', label: 'Recipes', description: 'Manage production recipes and formulations.', icon: FlaskConical, kind: 'embed', component: RecipeManager },
      { key: 'product-links', label: 'Product Links', description: 'Link supplier packing-slip names to your stock items.', icon: Link2, kind: 'embed', component: ProductLinksManager },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: Package,
    items: [
      { key: 'inventory-settings', label: 'Inventory Settings', description: 'Stock thresholds and low-stock alerts.', icon: Boxes, kind: 'link', path: '/inventory' },
      { key: 'suppliers', label: 'Suppliers', description: 'Manage supplier details and contacts.', icon: Truck, kind: 'link', path: '/suppliers' },
      { key: 'import', label: 'Import Data', description: 'Bulk import batch history or customers via CSV.', icon: Upload, kind: 'embed', component: ImportDataPanel },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    icon: ClipboardList,
    items: [
      { key: 'checklists', label: 'Checklists', description: 'Create and edit team checklists.', icon: CheckSquare, kind: 'embed', component: ChecklistManager },
      { key: 'maintenance', label: 'Maintenance', description: 'Equipment maintenance records and schedules.', icon: Wrench, kind: 'link', path: '/maintenance' },
      { key: 'pest-map', label: 'Pest Map', description: 'Upload the floor plan used on the Pest Control map.', icon: MapPin, kind: 'embed', component: PestControlMapSettings },
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance',
    icon: ShieldCheck,
    items: [
      { key: 'compliance-settings', label: 'Compliance Settings', description: 'Manage compliance and operational requirements.', icon: ShieldCheck, kind: 'embed', component: ComplianceSettings },
    ],
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      { key: 'dashboard-config', label: 'Dashboard Configuration', description: 'Customise the quick links shown on your dashboard.', icon: LayoutDashboard, kind: 'embed', component: DashboardLinkManager },
    ],
  },
  {
    key: 'system',
    label: 'System',
    icon: Lock,
    items: [
      { key: 'permissions', label: 'Permissions', description: 'Toggle page access per role and assign user roles.', icon: ShieldCheck, kind: 'link', path: '/permissions', superAdminOnly: true },
      { key: 'backup', label: 'Backup', description: 'Export your data for backup or safekeeping.', icon: Database, kind: 'embed', component: DataExportPanel },
    ],
  },
];

export function findSettingsItem(categoryKey, itemKey) {
  const category = SETTINGS_NAV.find((c) => c.key === categoryKey);
  const item = category?.items.find((i) => i.key === itemKey);
  return item ? { category, item } : null;
}

// Cards shown on the Settings landing page's "Frequently Used" row.
export const FREQUENTLY_USED = [
  { categoryKey: 'distillery', itemKey: 'tanks' },
  { categoryKey: 'distillery', itemKey: 'recipes' },
  { categoryKey: 'account', itemKey: 'users-team' },
  { categoryKey: 'compliance', itemKey: 'compliance-settings' },
];
