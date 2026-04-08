import { useState, useEffect } from 'react';
import { localApi } from '@/services/localApi';
import { sseClient } from '@/services/sseClient';

export function useActiveOrderCount(restaurantId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!restaurantId) {
      setCount(0);
      return;
    }

    const fetchCount = async () => {
      try {
        const orders = await localApi.getOrders(restaurantId, 'active');
        setCount(orders?.length || 0);
      } catch {
        // ignore
      }
    };

    fetchCount();

    // Real-time subscription via SSE
    const unsub = sseClient.on('order_change', () => {
      fetchCount();
    });

    return () => {
      unsub();
    };
  }, [restaurantId]);

  return count;
}
