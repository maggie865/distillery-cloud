import NavGroupHub from '@/components/shared/NavGroupHub';

// Descriptions for EMS-group tiles — see Compliance.jsx for the same
// pattern. This starts with just Waste Tracker and Utilities (relocated
// from Compliance); an environmental policy, aspects/impacts register,
// objectives & targets, and lifecycle/carbon reporting are planned as
// separate follow-up additions here, built one at a time.
const DESCRIPTIONS = {
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
