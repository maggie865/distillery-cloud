import PageHeader from '@/components/shared/PageHeader';
import PermissionsPanel from '@/components/settings/PermissionsPanel';

// The actual content lives in PermissionsPanel so it can be embedded
// directly inside Settings (see settingsNav.js) - this route stays as a
// thin wrapper so a direct /permissions link still works.
export default function Permissions() {
  return (
    <div>
      <PageHeader
        title="Permissions"
        subtitle="Assign user roles and control which pages each role can access"
      />
      <PermissionsPanel />
    </div>
  );
}
