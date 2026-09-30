import { base44 } from '@/api/base44Client';

// Sequential human-readable pallet codes (PAL-00001, PAL-00002, ...) — same
// counter-in-AppSettings pattern already used for packing slip numbers
// (see Warehouse.jsx / TransferTo3PLDialog.jsx's 'last_packing_slip_number').
export async function generatePalletCode() {
  const allSettings = await base44.entities.AppSettings.list('-created_at', 5000);
  const lastNumSetting = allSettings.find(s => s.key === 'last_pallet_number');
  const lastNum = lastNumSetting ? parseInt(lastNumSetting.value) || 0 : 0;
  const newNum = lastNum + 1;
  const code = `PAL-${String(newNum).padStart(5, '0')}`;

  if (lastNumSetting) {
    await base44.entities.AppSettings.update(lastNumSetting.id, { value: String(newNum) });
  } else {
    await base44.entities.AppSettings.create({ key: 'last_pallet_number', value: String(newNum) });
  }

  return code;
}
