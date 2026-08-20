import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, admin } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

const ROLES = ['super_admin', 'admin', 'user'];
const TOGGLEABLE_ROLES = ['admin', 'user'];

export default function PermissionsPanel() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      const { data, error } = await admin.listUsers();
      if (error) throw error;
      return data;
    },
  });

  const permissionsQuery = useQuery({
    queryKey: ['pagePermissions'],
    queryFn: () => db.PagePermission.list('page_key', 100),
  });

  const setRoleMutation = useMutation({
    mutationFn: async ({ userId, role }) => {
      const { error } = await admin.setUserRole(userId, role);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast.success('Role updated');
    },
    onError: (e) => toast.error(e.message || 'Failed to update role'),
  });

  const togglePageRoleMutation = useMutation({
    mutationFn: async ({ page, role, enabled }) => {
      const nextRoles = enabled
        ? [...new Set([...page.allowed_roles, role])]
        : page.allowed_roles.filter((r) => r !== role);
      return db.PagePermission.update(page.id, { allowed_roles: nextRoles });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pagePermissions'] }),
    onError: (e) => toast.error(e.message || 'Failed to update page access'),
  });

  const users = usersQuery.data || [];
  const pages = permissionsQuery.data || [];

  return (
    <div className="space-y-6">
      <Card className="p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-1">Users</h2>
        <p className="text-sm text-muted-foreground mb-4">
          super_admin always has access to every page, regardless of the toggles below.
        </p>
        {usersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : usersQuery.isError ? (
          <p className="text-sm text-destructive">{usersQuery.error.message}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last sign in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.email}
                      {u.id === currentUser?.id && <Badge variant="outline" className="ml-2">You</Badge>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(role) => setRoleMutation.mutate({ userId: u.id, role })}
                        disabled={setRoleMutation.isPending}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-1">Page access</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Toggle which roles can see each page. Changes apply immediately for that role.
        </p>
        {permissionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  {TOGGLEABLE_ROLES.map((r) => (
                    <TableHead key={r} className="text-center capitalize">{r}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page) => (
                  <TableRow key={page.id}>
                    <TableCell className="font-medium">{page.label}</TableCell>
                    {TOGGLEABLE_ROLES.map((role) => (
                      <TableCell key={role} className="text-center">
                        <Checkbox
                          checked={page.allowed_roles.includes(role)}
                          onCheckedChange={(checked) =>
                            togglePageRoleMutation.mutate({ page, role, enabled: !!checked })
                          }
                          disabled={togglePageRoleMutation.isPending}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
