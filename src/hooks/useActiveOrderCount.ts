import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useActiveOrderCount(restaurantId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!restaurantId) {
      setCount(0);
      return;
    }

    const fetchCount = async () => {
      const { count: orderCount, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .in('status', ['pending', 'cooking']);

      if (!error && orderCount !== null) {
        setCount(orderCount);
      }
    };

    fetchCount();

    // Real-time subscription
    const channel = supabase
      .channel('order-count-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  return count;
}
