/**
 * src/lib/pages.js — single source of truth for every real app page.
 *
 * Drives route generation (App.jsx), navigation (Sidebar.jsx, MobileNav.jsx),
 * and the super-admin permissions matrix (Permissions.jsx) - all three used
 * to maintain their own separate, hand-duplicated lists of pages, which is
 * exactly the kind of thing that quietly drifts out of sync. `key` here
 * must match `page_key` in the page_permission table
 * (20260806030000_roles_and_permissions.sql).
 *
 * `navGroup: null` means the page has a route but isn't linked from any nav
 * menu, while still being gated by PageGate and listed in the Permissions
 * page - not currently used by any page, but supported if a future one
 * needs a route without a nav entry.
 *
 * `isHub: true` marks the one page per navGroup that's a NavGroupHub tile
 * dashboard (Production.jsx, InventoryHub.jsx, Compliance.jsx, EMS.jsx).
 * TopNav.jsx reads it two ways: the group's row-1 button links straight to
 * that hub page instead of toggling open a row-2 quick-list, and
 * HubSidebar.jsx reads it to find which page is the "Overview" link and
 * which group to show a left-nav for. A navGroup with no isHub page (Sales)
 * keeps the old row-1-toggles-row-2 behavior untouched.
 */
import {
  Home, Droplets, Flame, Wine, Cylinder, TrendingUp, Users,
  Warehouse, Building2, FileText, Settings as SettingsIcon, PackagePlus,
  Truck, ClipboardList, Thermometer, Wrench, Bug, AlertTriangle, CheckSquare,
  Leaf, Archive, Zap, ShieldCheck, Activity, ClipboardCheck, Recycle, Target, Scale, ClipboardPen, Globe2,
  Factory, Boxes, CalendarDays, GraduationCap,
} from 'lucide-react';

import Compliance from '@/pages/Compliance';
import EMS from '@/pages/EMS';
import Production from '@/pages/Production';
import ProductionPlanner from '@/pages/ProductionPlanner';
import InventoryHub from '@/pages/InventoryHub';
import AspectsRegister from '@/pages/AspectsRegister';
import Objectives from '@/pages/Objectives';
import LegalRegister from '@/pages/LegalRegister';
import ManagementReview from '@/pages/ManagementReview';
import LifecycleReport from '@/pages/LifecycleReport';
import Dashboard from '@/pages/Dashboard';
import Receiving from '@/pages/Receiving';
import Dilutions from '@/pages/Dilutions';
import Distillation from '@/pages/Distillation';
import Inventory from '@/pages/Inventory';
import Warehouse_ from '@/pages/Warehouse';
import Tanks from '@/pages/Tanks';
import BottlingFloor from '@/pages/BottlingFloor';
import DispatchHub from '@/pages/DispatchHub';
import Customers from '@/pages/Customers';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import SNSDistillation from '@/pages/SNSDistillation';
import StockTakes from '@/pages/StockTakes';
import FoodRecallManager from '@/pages/FoodRecall';
import MaintenanceRecords from '@/pages/MaintenanceRecords';
import PestControl from '@/pages/PestControl';
import Checklists from '@/pages/Checklists';
import WasteTracker from '@/pages/WasteTracker';
import TemperatureLogs from '@/pages/TemperatureLogs';
import Suppliers from '@/pages/Suppliers';
import WhiskeyBarrels from '@/pages/WhiskeyBarrels';
import UtilityTracker from '@/pages/UtilityTracker';
import Permissions from '@/pages/Permissions';
import TankDetail from '@/pages/TankDetail';
import SalesOverview from '@/pages/SalesOverview';
import CustomerDetail from '@/pages/CustomerDetail';
import OrderDetail from '@/pages/OrderDetail';
import StaffTraining from '@/pages/StaffTraining';
import StaffTrainingDetail from '@/pages/StaffTrainingDetail';

export const NAV_GROUPS = ['Production', 'Inventory', 'Sales', 'Compliance', 'EMS'];

export const PAGES = [
  { key: 'dashboard',        label: 'Dashboard',        path: '/',                 icon: Home,          component: Dashboard,        navGroup: 'top' },

  { key: 'production',        label: 'Production',        path: '/production',       icon: Factory,       component: Production,        navGroup: 'Production', isHub: true },
  { key: 'production-planner', label: 'Production Planner', path: '/production-planner', icon: CalendarDays, component: ProductionPlanner, navGroup: 'Production' },
  { key: 'tanks',             label: 'Tanks',             path: '/tanks',             icon: Cylinder,      component: Tanks,             navGroup: 'Production' },
  { key: 'tank-detail',       label: 'Tank Detail',       path: '/tanks/:tankId',     icon: Cylinder,      component: TankDetail,        navGroup: null },
  { key: 'dilutions',         label: 'Dilutions',         path: '/dilutions',         icon: Droplets,      component: Dilutions,         navGroup: 'Production' },
  { key: 'distillation',      label: 'Distillations',     path: '/distillation',      icon: Flame,         component: Distillation,      navGroup: 'Production' },
  { key: 'sns-distillation',  label: 'SNS Distillation',  path: '/sns-distillation',  icon: Flame,         component: SNSDistillation,   navGroup: 'Production' },
  { key: 'bottling-floor',    label: 'Bottling Floor',    path: '/bottling-floor',    icon: Wine,          component: BottlingFloor,     navGroup: 'Production' },

  { key: 'inventory-hub',     label: 'Inventory',         path: '/inventory-hub',     icon: Boxes,         component: InventoryHub,      navGroup: 'Inventory', isHub: true },
  { key: 'inventory',         label: 'Finished Goods',    path: '/inventory',         icon: Warehouse,     component: Inventory,         navGroup: 'Inventory' },
  { key: 'warehouse',         label: 'Warehouse (3PL)',   path: '/warehouse',         icon: Building2,     component: Warehouse_,        navGroup: 'Inventory' },
  { key: 'receiving',         label: 'Receiving',         path: '/receiving',         icon: PackagePlus,   component: Receiving,         navGroup: 'Inventory' },
  { key: 'stock-takes',       label: 'Stock Takes',       path: '/stock-takes',       icon: ClipboardList, component: StockTakes,        navGroup: 'Inventory' },
  { key: 'whiskey-barrels',   label: 'Whiskey Barrels',   path: '/whiskey-barrels',   icon: Archive,       component: WhiskeyBarrels,    navGroup: 'Inventory' },

  { key: 'sales',             label: 'Sales',             path: '/sales',             icon: Activity,      component: SalesOverview,     navGroup: 'Sales' },
  { key: 'dispatch',          label: 'Dispatch',          path: '/dispatch',          icon: TrendingUp,    component: DispatchHub,       navGroup: 'Sales' },
  { key: 'customers',         label: 'Customers',         path: '/customers',         icon: Users,         component: Customers,         navGroup: 'Sales' },
  { key: 'customer-detail',   label: 'Customer Detail',   path: '/customers/:customerId', icon: Users,     component: CustomerDetail,    navGroup: null },
  { key: 'order-detail',      label: 'Order Detail',      path: '/customers/:customerId/orders/:orderId', icon: Users, component: OrderDetail, navGroup: null },
  { key: 'suppliers',         label: 'Suppliers',         path: '/suppliers',         icon: Truck,         component: Suppliers,         navGroup: 'Sales' },

  { key: 'compliance',        label: 'Compliance',        path: '/compliance',        icon: ClipboardCheck, component: Compliance,       navGroup: 'Compliance', isHub: true },
  { key: 'checklists',        label: 'Daily Checks',      path: '/daily-checks',      icon: CheckSquare,   component: Checklists,        navGroup: 'Compliance' },
  { key: 'temperature-logs',  label: 'Temperature Logs',  path: '/temperature-logs',  icon: Thermometer,   component: TemperatureLogs,   navGroup: 'Compliance' },
  { key: 'maintenance',       label: 'Maintenance',       path: '/maintenance',       icon: Wrench,        component: MaintenanceRecords, navGroup: 'Compliance' },
  { key: 'pest-control',      label: 'Pest Control',      path: '/pest-control',      icon: Bug,           component: PestControl,       navGroup: 'Compliance' },
  { key: 'food-recall',       label: 'Food Recall',       path: '/food-recall',       icon: AlertTriangle, component: FoodRecallManager, navGroup: 'Compliance' },
  { key: 'staff-training',    label: 'Staff Training',    path: '/staff-training',    icon: GraduationCap, component: StaffTraining,     navGroup: 'Compliance' },
  { key: 'staff-training-detail', label: 'Staff Training Detail', path: '/staff-training/:staffId', icon: GraduationCap, component: StaffTrainingDetail, navGroup: null },

  { key: 'ems',               label: 'EMS',               path: '/ems',               icon: Recycle,       component: EMS,               navGroup: 'EMS', isHub: true },
  { key: 'aspects-register',  label: 'Aspects & Impacts Register', path: '/aspects-register', icon: FileText, component: AspectsRegister, navGroup: 'EMS' },
  { key: 'objectives',        label: 'Objectives & Targets', path: '/objectives',      icon: Target,        component: Objectives,        navGroup: 'EMS' },
  { key: 'legal-register',    label: 'Legal & Compliance Register', path: '/legal-register', icon: Scale,   component: LegalRegister,     navGroup: 'EMS' },
  { key: 'management-review', label: 'Management Review', path: '/management-review', icon: ClipboardPen,  component: ManagementReview,  navGroup: 'EMS' },
  { key: 'lifecycle-report',  label: 'Lifecycle Report',  path: '/lifecycle-report',  icon: Globe2,        component: LifecycleReport,   navGroup: 'EMS' },
  { key: 'waste-tracker',     label: 'Waste Tracker',     path: '/waste-tracker',     icon: Leaf,          component: WasteTracker,      navGroup: 'EMS' },
  { key: 'utilities',         label: 'Utilities',         path: '/utilities',         icon: Zap,           component: UtilityTracker,    navGroup: 'EMS' },

  { key: 'reports',           label: 'Reports',           path: '/reports',           icon: FileText,      component: Reports,           navGroup: 'bottom' },
  { key: 'settings',          label: 'Settings',          path: '/settings',          icon: SettingsIcon,  component: Settings,          navGroup: 'bottom' },

  // Super-admin only - not part of the toggleable permission matrix at all
  // (see PageGate.jsx), so it has no corresponding page_permission row.
  // navGroup: null - reachable via Settings (System > Permissions / Account >
  // Users & Team, both now embedded via PermissionsPanel), not its own
  // top-nav destination, but the route stays live as a direct-link fallback.
  { key: 'permissions',       label: 'Permissions',       path: '/permissions',       icon: ShieldCheck,   component: Permissions,       navGroup: null, superAdminOnly: true },
];
