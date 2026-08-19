import NavGroupHub from '@/components/shared/NavGroupHub';

// Descriptions for EMS-group tiles — see Compliance.jsx for the same
// pattern. Management review and lifecycle/carbon reporting are planned
// as separate follow-up additions here, built one at a time.
const DESCRIPTIONS = {
  'aspects-register': 'Environmental policy and the ISO 14001 aspects & impacts significance register',
  'objectives': 'Measurable goals tracked against live Waste/Utility data',
  'legal-register': 'Regulations, consents, and licences with compliance status',
  'waste-tracker': 'Waste volumes and disposal records',
  'utilities': 'Power, water, and gas usage tracking',
};

export default function EMS() {
  return (
    <NavGroupHub
      title="Environmental Management System"
      subtitle="Waste, utilities, and environmental performance"
      navGroup="EMS"
      ownKey="ems"
      descriptions={DESCRIPTIONS}
    />
  );
}
