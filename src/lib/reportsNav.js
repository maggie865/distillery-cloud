/**
 * src/lib/reportsNav.js — single source of truth for the Reports section's
 * category tree, mirroring the role settingsNav.js plays for Settings.
 *
 * Unlike settingsNav.js, items here don't carry a `component` reference —
 * the underlying report components have incompatible, specific prop
 * signatures (startDate/endDate, selectedMonth/onMonthChange, or none at
 * all), so there's no safe zero-prop <item.component /> render. Reports.jsx
 * keeps its own switch on `item.key` to render the right component with its
 * real props. There's also no `kind: 'embed'|'link'` field — every report
 * here is embedded, none point out to a separate page.
 *
 * `needsDateRange` / `hasPageExport` drive whether Reports.jsx shows the
 * shared date-range picker and the page-level Export CSV button for the
 * selected item — some reports own their own period control (Excise's
 * month picker, Carbon Offsets' year picker, Forecast's settings panel) or
 * have no period concept at all (Inventory Snapshot, Batch Trace), and some
 * already have their own export affordance (Sales).
 */
import {
  Package, Calculator, ArrowLeftRight, TrendingDown,
  Receipt, LineChart, FileCheck, Search, Leaf, Recycle,
} from 'lucide-react';

export const REPORTS_NAV = [
  {
    key: 'production',
    label: 'Production',
    icon: Package,
    items: [
      { key: 'overview', label: 'Inventory Snapshot', description: 'Live stock across distillery, warehouse and tanks.', icon: Package, needsDateRange: false, hasPageExport: true },
      { key: 'cogs', label: 'Cost of Goods', description: 'Per-batch and current-inventory cost breakdown.', icon: Calculator, needsDateRange: true, hasPageExport: true },
      { key: 'movements', label: 'Movements', description: 'Inbound, outbound and tank movement ledger.', icon: ArrowLeftRight, needsDateRange: true, hasPageExport: true },
      { key: 'wastage', label: 'Wastage Analysis', description: 'Volume, LALs and cost of wasted spirit by source.', icon: TrendingDown, needsDateRange: true, hasPageExport: true },
    ],
  },
  {
    key: 'sales-forecasting',
    label: 'Sales & Forecasting',
    icon: Receipt,
    items: [
      { key: 'sales', label: 'Sales', description: 'Dispatch-level sales with product, channel and customer filters.', icon: Receipt, needsDateRange: true, hasPageExport: false },
      { key: 'forecast', label: 'Forecast', description: 'Demand and raw-material forecast with adjustable settings.', icon: LineChart, needsDateRange: false, hasPageExport: false },
    ],
  },
  {
    key: 'compliance-traceability',
    label: 'Compliance & Traceability',
    icon: FileCheck,
    items: [
      { key: 'excise', label: 'Excise Return', description: 'Monthly TSW excise calculation.', icon: FileCheck, needsDateRange: false, hasPageExport: true },
      { key: 'batch-trace', label: 'Batch Trace', description: 'Search and drill into any batch across its full lifecycle.', icon: Search, needsDateRange: false, hasPageExport: false },
    ],
  },
  {
    key: 'sustainability',
    label: 'Sustainability',
    icon: Leaf,
    items: [
      { key: 'carbon', label: 'Carbon Footprint', description: 'Emissions by scope, offsets and certificates.', icon: Leaf, needsDateRange: true, hasPageExport: true },
      { key: 'iso', label: 'ISO Lifecycle', description: 'Scope 1/2/3 lifecycle emissions breakdown.', icon: Recycle, needsDateRange: true, hasPageExport: true },
    ],
  },
];

export function findReportItem(categoryKey, itemKey) {
  const category = REPORTS_NAV.find((c) => c.key === categoryKey);
  const item = category?.items.find((i) => i.key === itemKey);
  return item ? { category, item } : null;
}

// Reports landing page's "Frequently Used" row.
export const FREQUENTLY_USED = [
  { categoryKey: 'production', itemKey: 'overview' },
  { categoryKey: 'sales-forecasting', itemKey: 'sales' },
  { categoryKey: 'compliance-traceability', itemKey: 'excise' },
];
