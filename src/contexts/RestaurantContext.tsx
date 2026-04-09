import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type StaffRole = Database['public']['Enums']['staff_role'];

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  created_at: string;
}

interface StaffRestaurant extends Restaurant {
  role: StaffRole;
  isOwner: boolean;
}

interface RestaurantContextType {
  restaurants: Restaurant[];
  staffRestaurants: StaffRestaurant[];
  currentRestaurant: Restaurant | null;
  currentRole: StaffRole | null;
  setCurrentRestaurant: (restaurant: Restaurant | null) => void;
  loading: boolean;
  createRestaurant: (name: string, address?: string, phone?: string, gstin?: string) => Promise<Restaurant | null>;
  refreshRestaurants: () => Promise<void>;
  isOwner: boolean;
  isManager: boolean;
  hasManagementAccess: boolean;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [staffRestaurants, setStaffRestaurants] = useState<StaffRestaurant[]>([]);
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [currentRole, setCurrentRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRestaurants = async () => {
    if (!user) {
      setRestaurants([]);
      setStaffRestaurants([]);
      setCurrentRestaurant(null);
      setCurrentRole(null);
      setLoading(false);
      return;
    }

    try {
      // First, try to link account if email matches an unlinked staff member
      const { data: unlinkedStaff } = await supabase
        .from('staff_members')
        .select('id')
        .eq('email', user.email || '')
        .is('user_id', null)
        .limit(1);

      if (unlinkedStaff && unlinkedStaff.length > 0) {
        // Link all staff records with this email to the user
        await supabase
          .from('staff_members')
          .update({ user_id: user.id, joined_at: new Date().toISOString() })
          .eq('email', user.email || '')
          .is('user_id', null);
      }

      // Fetch owned restaurants
      const { data: ownedData, error: ownedError } = await supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (ownedError) throw ownedError;

      // Fetch staff memberships with restaurant info
      const { data: staffData, error: staffError } = await supabase
        .from('staff_members')
        .select(`
          role,
          restaurants (
            id,
            name,
            slug,
            address,
            phone,
            gstin,
            created_at,
            owner_id
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (staffError) throw staffError;

      // Build staff restaurants list
      const staffRests: StaffRestaurant[] = (staffData || [])
        .filter(s => s.restaurants)
        .map(s => {
          const r = s.restaurants as any;
          return {
            id: r.id,
            name: r.name,
            slug: r.slug,
            address: r.address,
            phone: r.phone,
            gstin: r.gstin,
            created_at: r.created_at,
            role: s.role,
            isOwner: r.owner_id === user.id,
          };
        });

      setRestaurants(ownedData || []);
      setStaffRestaurants(staffRests);

      // Set current restaurant - prefer from staff list for role info
      if (staffRests.length > 0 && !currentRestaurant) {
        setCurrentRestaurant(staffRests[0]);
        setCurrentRole(staffRests[0].role);
      } else if (ownedData && ownedData.length > 0 && !currentRestaurant) {
        setCurrentRestaurant(ownedData[0]);
        setCurrentRole('owner');
      }
    } catch (error) {
      console.error('Error fetching restaurants:', error);
    } finally {
      setLoading(false);
    }
  };

  // Update role when current restaurant changes
  useEffect(() => {
    if (currentRestaurant) {
      const staffRest = staffRestaurants.find(r => r.id === currentRestaurant.id);
      if (staffRest) {
        setCurrentRole(staffRest.role);
      } else if (restaurants.find(r => r.id === currentRestaurant.id)) {
        setCurrentRole('owner');
      }
    }
  }, [currentRestaurant, staffRestaurants, restaurants]);

  useEffect(() => {
    fetchRestaurants();
  }, [user]);

  const createRestaurant = async (
    name: string,
    address?: string,
    phone?: string,
    gstin?: string
  ): Promise<Restaurant | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('restaurants')
        .insert({
          owner_id: user.id,
          name,
          address: address || null,
          phone: phone || null,
          gstin: gstin || null,
          slug: '', // Auto-generated by database trigger
        } as any)
        .select()
        .single();

      if (error) throw error;

      await fetchRestaurants(); // Refresh to get staff member entry
      setCurrentRestaurant(data);
      setCurrentRole('owner');
      toast.success('Restaurant created successfully!');
      return data;
    } catch (error: any) {
      console.error('Error creating restaurant:', error);
      toast.error(error.message || 'Failed to create restaurant');
      return null;
    }
  };

  const refreshRestaurants = async () => {
    await fetchRestaurants();
  };

  const isOwner = currentRole === 'owner';
  const isManager = currentRole === 'manager';
  const hasManagementAccess = isOwner || isManager;

  return (
    <RestaurantContext.Provider
      value={{
        restaurants,
        staffRestaurants,
        currentRestaurant,
        currentRole,
        setCurrentRestaurant,
        loading,
        createRestaurant,
        refreshRestaurants,
        isOwner,
        isManager,
        hasManagementAccess,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  const context = useContext(RestaurantContext);
  if (context === undefined) {
    throw new Error('useRestaurant must be used within a RestaurantProvider');
  }
  return context;
}
