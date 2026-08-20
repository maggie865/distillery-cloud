import NavGroupHub from '@/components/shared/NavGroupHub';

// Descriptions for Production-group tiles — see Compliance.jsx for the
// same pattern.
const DESCRIPTIONS = {
  'production-planner': 'Schedule upcoming runs against tank availability',
  'tanks': 'Storage tank levels, transfers, and movements',
  'dilutions': 'Cut spirit down to bottling strength',
  'distillation': 'Log distillation runs and yields',
  'sns-distillation': 'Spirit-not-spirit distillation runs',
  'bottling-floor': 'Run bottling and deplete packaging stock',
};

export default function Production() {
  return (
    <NavGroupHub
      title="Production"
      subtitle="Tanks, distillation, and bottling"
      navGroup="Production"
      ownKey="production"
      descriptions={DESCRIPTIONS}
    />
  );
}
