import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

/**
 * Manual "priority" customers — per signed-in user, not per role, so any
 * account can pin their own key customers to the top of their list. Backed
 * by customer_pin (RLS-scoped to auth.uid() so this only ever reads/writes
 * the current user's own pins, never anyone else's).
 */
export function useCustomerPins() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pins = [], isLoading } = useQuery({
    queryKey: ['customerPins', user?.id],
    queryFn: () => db.CustomerPin.filter({ user_id: user.id }),
    enabled: !!user?.id,
  });

  const pinnedIds = new Set(pins.map((p) => p.customer_id));

  const addPin = useMutation({
    mutationFn: (customerId) => db.CustomerPin.create({ user_id: user.id, customer_id: customerId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customerPins', user?.id] }),
  });

  const removePin = useMutation({
    mutationFn: (customerId) => {
      const pin = pins.find((p) => p.customer_id === customerId);
      return pin ? db.CustomerPin.delete(pin.id) : Promise.resolve();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customerPins', user?.id] }),
  });

  const togglePin = (customerId) => {
    if (pinnedIds.has(customerId)) removePin.mutate(customerId);
    else addPin.mutate(customerId);
  };

  return { pinnedIds, togglePin, isLoading };
}
