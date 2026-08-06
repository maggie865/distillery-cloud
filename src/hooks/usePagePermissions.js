import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';

/**
 * Fetches the page_permission table once and shares it across PageGate,
 * Sidebar, MobileNav, and the Permissions page via react-query's cache -
 * one network call backs every permission check in the app.
 */
export function usePagePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: ['pagePermissions'],
    queryFn: () => db.PagePermission.list('page_key', 100),
  });

  const byKey = {};
  for (const row of data || []) byKey[row.page_key] = row;

  // super_admin bypasses this entirely (checked by the caller). Deny by
  // default if a page has no row yet, rather than silently allowing it.
  const canAccess = (pageKey, role) => byKey[pageKey]?.allowed_roles?.includes(role) ?? false;

  return { permissions: byKey, isLoading, canAccess };
}
