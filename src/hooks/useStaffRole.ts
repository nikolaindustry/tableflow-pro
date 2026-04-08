import { useState, useEffect } from 'react';
import { localApi } from '@/services/localApi';
import { useAuth } from '@/contexts/AuthContext';

type StaffRole = 'owner' | 'manager' | 'waiter' | 'chef' | 'cashier';

interface StaffMemberInfo {
  id: string;
  restaurant_id: string;
  role: StaffRole;
  full_name: string;
  email: string;
  is_active: boolean;
}

interface UseStaffRoleResult {
  staffInfo: StaffMemberInfo | null;
  staffRestaurants: { id: string; name: string; slug: string; role: StaffRole }[];
  loading: boolean;
  isOwner: boolean;
  isManager: boolean;
  isWaiter: boolean;
  isChef: boolean;
  hasManagementAccess: boolean;
  refreshStaffInfo: () => Promise<void>;
}

export function useStaffRole(): UseStaffRoleResult {
  const { user } = useAuth();
  const [staffInfo, setStaffInfo] = useState<StaffMemberInfo | null>(null);
  const [staffRestaurants, setStaffRestaurants] = useState<{ id: string; name: string; slug: string; role: StaffRole }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStaffInfo = async () => {
    if (!user) {
      setStaffInfo(null);
      setStaffRestaurants([]);
      setLoading(false);
      return;
    }

    try {
      // Link unlinked staff by email
      await localApi.linkStaff(user.email || '', user.id).catch(() => {});

      // Fetch all staff memberships for this user
      const restaurants = await localApi.getStaffRestaurants();

      if (restaurants && restaurants.length > 0) {
        const firstStaff = restaurants[0];
        setStaffInfo({
          id: firstStaff.staff_id || firstStaff.id,
          restaurant_id: firstStaff.restaurant_id || firstStaff.id,
          role: firstStaff.role,
          full_name: firstStaff.full_name || '',
          email: firstStaff.email || user.email || '',
          is_active: true,
        });

        // Build list of restaurants with roles
        setStaffRestaurants(restaurants.map((s: any) => ({
          id: s.restaurant_id || s.id,
          name: s.name || s.restaurant_name || '',
          slug: s.slug || '',
          role: s.role,
        })));
      } else {
        setStaffInfo(null);
        setStaffRestaurants([]);
      }
    } catch (error) {
      console.error('Error fetching staff info:', error);
      setStaffInfo(null);
      setStaffRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffInfo();
  }, [user]);

  const role = staffInfo?.role;

  return {
    staffInfo,
    staffRestaurants,
    loading,
    isOwner: role === 'owner',
    isManager: role === 'manager',
    isWaiter: role === 'waiter',
    isChef: role === 'chef',
    hasManagementAccess: role === 'owner' || role === 'manager',
    refreshStaffInfo: fetchStaffInfo,
  };
}

// Hook to get staff role for a specific restaurant
export function useStaffRoleForRestaurant(restaurantId: string | undefined): {
  role: StaffRole | null;
  loading: boolean;
  isOwner: boolean;
  isManager: boolean;
  isWaiter: boolean;
  isChef: boolean;
  hasManagementAccess: boolean;
} {
  const { user } = useAuth();
  const [role, setRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user || !restaurantId) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        // Get staff for this restaurant and find current user's role
        const staffList = await localApi.getStaff(restaurantId);
        const myStaff = staffList?.find((s: any) => s.user_id === user.id && s.is_active);
        setRole(myStaff?.role || null);
      } catch (error) {
        console.error('Error fetching staff role:', error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user, restaurantId]);

  return {
    role,
    loading,
    isOwner: role === 'owner',
    isManager: role === 'manager',
    isWaiter: role === 'waiter',
    isChef: role === 'chef',
    hasManagementAccess: role === 'owner' || role === 'manager',
  };
}
