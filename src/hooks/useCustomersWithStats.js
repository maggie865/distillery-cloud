import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { computeCustomerStats } from '@/lib/customerHealth';

/**
 * One shared fetch + computation pass for every customer, reused by the
 * Customers list, Needs Attention, Visit Report, Customer Detail, and the
 * Sales dashboard — avoids each screen re-deriving the same stats
 * differently, and react-query's cache means only one real fetch happens
 * per table no matter how many of those screens are mounted.
 */
export function useCustomersWithStats() {
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: () => db.Customer.list('business_name', 5000) });
  const activitiesQuery = useQuery({ queryKey: ['customerActivities'], queryFn: () => db.CustomerActivity.list('-date', 5000) });
  const requestsQuery = useQuery({ queryKey: ['customerRequests'], queryFn: () => db.CustomerRequest.list('-date_received', 5000) });
  const dispatchesQuery = useQuery({ queryKey: ['dispatches'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });

  const customers = customersQuery.data || [];
  const activities = activitiesQuery.data || [];
  const requests = requestsQuery.data || [];
  const dispatches = dispatchesQuery.data || [];

  const rows = useMemo(() => customers.map((customer) => {
    const customerActivities = activities.filter((a) => a.customer_id === customer.id);
    const customerRequests = requests.filter((r) => r.customer_id === customer.id);
    return {
      customer,
      activities: customerActivities,
      requests: customerRequests,
      ...computeCustomerStats(customer, { activities: customerActivities, requests: customerRequests, dispatches }),
    };
  }), [customers, activities, requests, dispatches]);

  return {
    rows,
    customers,
    activities,
    requests,
    dispatches,
    isLoading: customersQuery.isLoading || activitiesQuery.isLoading || requestsQuery.isLoading || dispatchesQuery.isLoading,
  };
}
