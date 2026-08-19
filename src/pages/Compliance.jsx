import NavGroupHub from '@/components/shared/NavGroupHub';

// One-line description for each Compliance-group page, shown on its tile
// below. Keyed by page_key so a page can be added/removed from the group in
// pages.js without this file needing a matching structural change — an
// entry just silently gets no description if one hasn't been added here.
const DESCRIPTIONS = {
  'checklists': "Team task lists and the bottle washer's pre-use check",
  'temperature-logs': 'Fridge/freezer temperature readings and out-of-range alerts',
  'maintenance': 'Monthly inspections and annual safety certifications',
  'pest-control': 'Bait station checks and pest activity records',
  'food-recall': 'Recall register and traceability records',
};

export default function Compliance() {
  return (
    <NavGroupHub
      title="Compliance"
      subtitle="Checklists, inspections, and regulatory records"
      navGroup="Compliance"
      ownKey="compliance"
      descriptions={DESCRIPTIONS}
    />
  );
}
