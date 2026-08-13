import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { toast } from 'sonner';

/**
 * Customer groups — user-defined tags, many per customer. One shared hook
 * so the Customers page filter/Groups tab and the per-customer tag editor
 * on CustomerDetail all read the same cached data (same query keys, react-query
 * dedupes), same pattern as useCustomersWithStats.
 */
export function useCustomerGroups() {
  const queryClient = useQueryClient();

  const { data: allGroups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['customerGroups'],
    queryFn: () => db.CustomerGroup.list('name', 1000),
  });
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['customerGroupMembers'],
    queryFn: () => db.CustomerGroupMember.list('-created_at', 10000),
  });

  const groupsByCustomerId = useMemo(() => {
    const m = new Map();
    for (const member of members) {
      const group = allGroups.find((g) => g.id === member.group_id);
      if (!group) continue;
      if (!m.has(member.customer_id)) m.set(member.customer_id, []);
      m.get(member.customer_id).push(group);
    }
    return m;
  }, [members, allGroups]);

  const groups = useMemo(() => {
    return allGroups.map((g) => ({
      ...g,
      memberCount: members.filter((m) => m.group_id === g.id).length,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allGroups, members]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['customerGroups'] });
    queryClient.invalidateQueries({ queryKey: ['customerGroupMembers'] });
  };

  const createGroupMutation = useMutation({
    mutationFn: (name) => db.CustomerGroup.create({ name: name.trim() }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message?.includes('duplicate') ? 'A group with that name already exists' : (e.message || 'Failed to create group')),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id) => db.CustomerGroup.delete(id),
    onSuccess: () => { invalidate(); toast.success('Group deleted'); },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ customerId, groupId }) => db.CustomerGroupMember.create({ customer_id: customerId, group_id: groupId }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message?.includes('duplicate') ? 'Already in that group' : (e.message || 'Failed to add to group')),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ customerId, groupId }) => {
      const member = members.find((m) => m.customer_id === customerId && m.group_id === groupId);
      if (member) await db.CustomerGroupMember.delete(member.id);
    },
    onSuccess: invalidate,
  });

  // Create the group (if it's new) and add the customer to it in one step —
  // used by the "type to create" affordance in CustomerGroupTagEditor.
  const addCustomerToGroupByName = async (customerId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    let group = allGroups.find((g) => g.name.toLowerCase() === trimmed.toLowerCase());
    if (!group) group = await db.CustomerGroup.create({ name: trimmed });
    await db.CustomerGroupMember.create({ customer_id: customerId, group_id: group.id });
    invalidate();
  };

  return {
    groups,
    groupsByCustomerId,
    isLoading: groupsLoading || membersLoading,
    createGroup: createGroupMutation.mutate,
    deleteGroup: deleteGroupMutation.mutate,
    addMember: addMemberMutation.mutate,
    removeMember: removeMemberMutation.mutate,
    addCustomerToGroupByName,
  };
}
