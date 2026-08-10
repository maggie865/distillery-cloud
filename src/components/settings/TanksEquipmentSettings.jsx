import TankFarmGrid from '@/components/tanks/TankFarmGrid';

// Same tank management as the Tanks page (/tanks), reached from Settings for
// people who think of tank setup as configuration rather than day-to-day
// operations. Delete is only offered here — the operational Tanks page never
// had it, so this preserves what Settings already let admins do.
export default function TanksEquipmentSettings() {
  return <TankFarmGrid allowDelete />;
}
