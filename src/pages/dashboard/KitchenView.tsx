import { useEffect, useState, useRef, useCallback } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  ChefHat,
  Clock,
  CheckCircle,
  Flame,
  Leaf,
  Drumstick,
  Timer,
  Bell,
  ArrowRight,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type OrderStatus = Database['public']['Enums']['order_status'];
type FoodType = Database['public']['Enums']['food_type'];

interface OrderItem {
  id: string;
  menu_item_id: string | null;
  quantity: number;
  unit_price: number;
  status: OrderStatus;
  notes: string | null;
  menu_item?: { name: string; food_type: FoodType; preparation_time: number | null };
}

interface Order {
  id: string;
  table_id: string | null;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  table?: { table_number: string; floor: { name: string } };
  order_items: OrderItem[];
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-warning/10 text-warning border-warning/30' },
  cooking: { label: 'Cooking', color: 'bg-primary/10 text-primary border-primary/30' },
  ready: { label: 'Ready', color: 'bg-success/10 text-success border-success/30' },
  served: { label: 'Served', color: 'bg-muted text-muted-foreground border-muted' },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/10 text-destructive border-destructive/30' },
};

// Create notification sound using Web Audio API
const createNotificationSound = (audioContext: AudioContext) => {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
  oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
  oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
};

export default function KitchenView() {
  const { currentRestaurant } = useRestaurant();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      
      createNotificationSound(audioContextRef.current);
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, [soundEnabled]);

  const fetchOrders = async () => {
    if (!currentRestaurant) return;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          table:tables(table_number, floor:floors(name)),
          order_items(*, menu_item:menu_items(name, food_type, preparation_time))
        `)
        .eq('restaurant_id', currentRestaurant.id)
        .in('status', ['pending', 'cooking', 'ready'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [currentRestaurant]);

  // Real-time subscription
  useEffect(() => {
    if (!currentRestaurant) return;

    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${currentRestaurant.id}`,
        },
        (payload) => {
          console.log('Order change:', payload);
          fetchOrders();
          
          if (payload.eventType === 'INSERT') {
            playNotificationSound();
            toast.info('New order received!', {
              icon: <Bell className="w-4 h-4" />,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        (payload) => {
          console.log('Order item change:', payload);
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRestaurant]);

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      // Also update all order items if moving to cooking or ready
      if (newStatus === 'cooking' || newStatus === 'ready') {
        await supabase
          .from('order_items')
          .update({ status: newStatus })
          .eq('order_id', orderId);
      }

      // If served, free up the table
      if (newStatus === 'served') {
        const order = orders.find((o) => o.id === orderId);
        if (order?.table_id) {
          await supabase.from('tables').update({ is_occupied: false }).eq('id', order.table_id);
        }
      }

      toast.success(`Order marked as ${STATUS_CONFIG[newStatus].label}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateItemStatus = async (itemId: string, newStatus: OrderStatus) => {
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ status: newStatus })
        .eq('id', itemId);

      if (error) throw error;
      toast.success(`Item marked as ${STATUS_CONFIG[newStatus].label}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getTimeSinceOrder = (createdAt: string) => {
    const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    return `${minutes} mins ago`;
  };

  const renderFoodTypeIcon = (type: FoodType) => (
    <span className={type === 'veg' ? 'text-success' : 'text-destructive'}>
      {type === 'veg' ? <Leaf className="w-4 h-4" /> : <Drumstick className="w-4 h-4" />}
    </span>
  );

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const cookingOrders = orders.filter((o) => o.status === 'cooking');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  if (!currentRestaurant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ChefHat className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">No Restaurant Selected</h2>
        <p className="text-muted-foreground">Please select or create a restaurant first</p>
      </div>
    );
  }

  const renderOrderColumn = (
    title: string,
    columnOrders: Order[],
    icon: React.ElementType,
    bgColor: string,
    nextStatus?: OrderStatus,
    nextStatusLabel?: string
  ) => {
    const Icon = icon;
    return (
      <div className="flex-1 min-w-[320px]">
        <div className={`rounded-t-xl p-4 ${bgColor}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="w-5 h-5" />
              <h2 className="font-semibold text-lg">{title}</h2>
            </div>
            <Badge variant="secondary" className="text-lg font-bold">
              {columnOrders.length}
            </Badge>
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-220px)] bg-muted/30 rounded-b-xl p-3">
          <div className="space-y-3">
            {columnOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders
              </div>
            ) : (
              columnOrders.map((order) => (
                <Card key={order.id} className="shadow-md hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {order.table ? (
                          <CardTitle className="text-base">
                            {order.table.table_number}
                            <span className="text-xs text-muted-foreground ml-1">
                              {order.table.floor.name}
                            </span>
                          </CardTitle>
                        ) : (
                          <CardTitle className="text-base">Takeaway</CardTitle>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground text-xs">
                        <Timer className="w-3 h-3" />
                        {getTimeSinceOrder(order.created_at)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 mb-3">
                      {order.order_items.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-2 rounded-lg border ${
                            item.status === 'ready'
                              ? 'bg-success/5 border-success/30'
                              : item.status === 'cooking'
                              ? 'bg-primary/5 border-primary/30'
                              : 'bg-card border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {item.menu_item && renderFoodTypeIcon(item.menu_item.food_type)}
                            <div>
                              <span className="font-medium text-sm">{item.menu_item?.name || 'Unknown'}</span>
                              <span className="text-muted-foreground text-sm ml-2">×{item.quantity}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.menu_item?.preparation_time && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.menu_item.preparation_time}m
                              </span>
                            )}
                            {order.status === 'cooking' && item.status !== 'ready' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleUpdateItemStatus(item.id, 'ready')}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Done
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {order.notes && (
                      <p className="text-xs text-muted-foreground italic mb-3 p-2 bg-muted/50 rounded">
                        Note: {order.notes}
                      </p>
                    )}
                    {nextStatus && (
                      <Button
                        className="w-full"
                        variant={nextStatus === 'served' ? 'default' : 'gradient'}
                        onClick={() => handleUpdateOrderStatus(order.id, nextStatus)}
                      >
                        {nextStatusLabel}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="w-7 h-7" />
            Kitchen View
          </h1>
          <p className="text-muted-foreground">Real-time order management for kitchen staff</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant={soundEnabled ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={soundEnabled ? 'text-primary' : 'text-muted-foreground'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 mr-2" />
            ) : (
              <VolumeX className="w-4 h-4 mr-2" />
            )}
            {soundEnabled ? 'Sound On' : 'Sound Off'}
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Live updates
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 min-w-[320px]">
              <div className="h-16 bg-muted rounded-t-xl animate-pulse" />
              <div className="h-[400px] bg-muted/50 rounded-b-xl p-3">
                <div className="h-32 bg-muted rounded animate-pulse mb-3" />
                <div className="h-32 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {renderOrderColumn(
            'Pending',
            pendingOrders,
            Clock,
            'bg-warning/20 text-warning-foreground',
            'cooking',
            'Start Cooking'
          )}
          {renderOrderColumn(
            'Cooking',
            cookingOrders,
            Flame,
            'bg-primary/20 text-primary-foreground',
            'ready',
            'Mark Ready'
          )}
          {renderOrderColumn(
            'Ready to Serve',
            readyOrders,
            CheckCircle,
            'bg-success/20 text-success-foreground',
            'served',
            'Mark Served'
          )}
        </div>
      )}
    </div>
  );
}
