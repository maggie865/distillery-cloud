import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import { PAGES } from '@/lib/pages';

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const NoPageAccess = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
    <h1 className="text-xl font-semibold text-foreground mb-2">No pages available</h1>
    <p className="text-muted-foreground max-w-sm">
      Your role doesn't have access to any pages yet. Ask a super admin to grant access in Settings → Permissions.
    </p>
  </div>
);

/**
 * Gates a single page by its page_key against the page_permission table
 * (super_admin always passes). Used per-page in App.jsx, not per-group -
 * each page's access is independently toggleable from the Permissions page.
 */
export default function PageGate({ pageKey, superAdminOnly = false }) {
  const { user } = useAuth();
  const { isLoading, canAccess } = usePagePermissions();

  if (isLoading) return <Spinner />;

  const isSuperAdmin = user?.role === 'super_admin';
  const allowed = isSuperAdmin || (!superAdminOnly && canAccess(pageKey, user?.role));

  if (allowed) return <Outlet />;

  const fallbackPage = PAGES.find(
    (p) => p.key !== pageKey && !p.superAdminOnly && canAccess(p.key, user?.role)
  );

  if (fallbackPage) return <Navigate to={fallbackPage.path} replace />;

  return <NoPageAccess />;
}
