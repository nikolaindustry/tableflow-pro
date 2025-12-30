import { useEffect, useState, useRef, useCallback } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  Printer,
  Bluetooth,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { useThermalPrinter } from '@/hooks/useThermalPrinter';
import { PrinterSelector } from '@/components/PrinterSelector';
import { BillData } from '@/services/thermalPrinter';

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
  const [printerSelectorOpen, setPrinterSelectorOpen] = useState(false);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const isMobile = useIsMobile();
  const audioContextRef = useRef<AudioContext | null>(null);

  // Thermal printer hook
  const { printBill: printThermal, connectedDevice, isBluetoothAvailable, printing } = useThermalPrinter();

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

      // Also update order items based on their current status
      if (newStatus === 'cooking') {
        // Only update pending items to cooking (preserve ready items)
        await supabase
          .from('order_items')
          .update({ status: newStatus })
          .eq('order_id', orderId)
          .eq('status', 'pending');
      } else if (newStatus === 'ready') {
        // Only update non-ready items to ready (e.g., cooking -> ready)
        await supabase
          .from('order_items')
          .update({ status: newStatus })
          .eq('order_id', orderId)
          .neq('status', 'ready');
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

  const handleUpdateItemStatus = async (itemId: string, newStatus: OrderStatus, orderId: string) => {
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ status: newStatus })
        .eq('id', itemId);

      if (error) throw error;
      
      // If marking as ready, check if all items in the order are now ready
      if (newStatus === 'ready') {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          // Check if all OTHER items are already ready (current item is being updated)
          const allItemsReady = order.order_items.every(
            item => item.id === itemId || item.status === 'ready'
          );
          
          if (allItemsReady) {
            // Auto-update order status to ready
            await supabase
              .from('orders')
              .update({ status: 'ready' })
              .eq('id', orderId);
            toast.success('All items ready - Order marked as Ready!');
            return;
          }
        }
      }
      
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

  const printKitchenTicket = (order: Order) => {
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) {
      toast.error('Please allow popups to print tickets');
      return;
    }

    const orderTime = new Date(order.created_at).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const orderDate = new Date(order.created_at).toLocaleDateString();

    const ticketHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Kitchen Ticket</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              padding: 10px; 
              width: 280px;
              font-size: 12px;
            }
            .header { 
              text-align: center; 
              border-bottom: 2px dashed #000; 
              padding-bottom: 10px; 
              margin-bottom: 10px;
            }
            .header h1 { font-size: 18px; font-weight: bold; }
            .header .table-info { font-size: 24px; font-weight: bold; margin: 8px 0; }
            .header .time { font-size: 14px; }
            .items { margin: 10px 0; }
            .item { 
              display: flex; 
              justify-content: space-between; 
              padding: 6px 0;
              border-bottom: 1px dotted #ccc;
            }
            .item-name { font-weight: bold; flex: 1; }
            .item-qty { 
              font-size: 16px; 
              font-weight: bold; 
              min-width: 40px; 
              text-align: right; 
            }
            .item-type { font-size: 10px; color: #666; }
            .veg { color: green; }
            .non-veg { color: red; }
            .notes { 
              margin-top: 10px; 
              padding: 8px; 
              background: #f5f5f5; 
              border-radius: 4px;
              font-style: italic;
            }
            .footer { 
              text-align: center; 
              margin-top: 15px; 
              padding-top: 10px;
              border-top: 2px dashed #000; 
              font-size: 10px;
            }
            @media print {
              body { width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🍳 KITCHEN ORDER</h1>
            <div class="table-info">${order.table ? order.table.table_number : 'TAKEAWAY'}</div>
            ${order.table ? `<div>${order.table.floor.name}</div>` : ''}
            <div class="time">${orderDate} ${orderTime}</div>
          </div>
          <div class="items">
            ${order.order_items.map(item => `
              <div class="item">
                <div>
                  <span class="item-type ${item.menu_item?.food_type === 'veg' ? 'veg' : 'non-veg'}">
                    ${item.menu_item?.food_type === 'veg' ? '🟢' : '🔴'}
                  </span>
                  <span class="item-name">${item.menu_item?.name || 'Unknown'}</span>
                </div>
                <span class="item-qty">x${item.quantity}</span>
              </div>
            `).join('')}
          </div>
          ${order.notes ? `<div class="notes"><strong>Notes:</strong> ${order.notes}</div>` : ''}
          <div class="footer">
            Order ID: ${order.id.slice(0, 8).toUpperCase()}<br>
            ${currentRestaurant?.name || 'Restaurant'}
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(ticketHtml);
    printWindow.document.close();
  };

  // Generate BillData for thermal kitchen ticket (items only, no prices)
  const getKitchenTicketData = useCallback((order: Order): BillData | null => {
    if (!currentRestaurant) return null;
    
    return {
      restaurantName: `KITCHEN - ${currentRestaurant.name}`,
      tableNumber: order.table ? order.table.table_number : 'TAKEAWAY',
      orderId: order.id,
      items: order.order_items.map(item => ({
        name: `${item.menu_item?.food_type === 'veg' ? '[V]' : '[NV]'} ${item.menu_item?.name || 'Unknown'}`,
        quantity: item.quantity,
        price: 0, // Kitchen tickets don't show prices
      })),
      total: 0, // Kitchen tickets don't show total
    };
  }, [currentRestaurant]);

  // Handle thermal printing for kitchen ticket
  const handleThermalPrint = useCallback(async (order: Order) => {
    const ticketData = getKitchenTicketData(order);
    if (!ticketData) {
      toast.error('Unable to generate ticket data');
      return;
    }
    
    try {
      await printThermal(ticketData, true);
      toast.success('Kitchen ticket printed via Bluetooth');
    } catch (error: any) {
      toast.error(error.message || 'Print failed');
    }
  }, [getKitchenTicketData, printThermal]);

  const renderFoodTypeIcon = (type: FoodType) => (
    <span className={type === 'veg' ? 'text-success' : 'text-destructive'}>
      {type === 'veg' ? <Leaf className="w-4 h-4" /> : <Drumstick className="w-4 h-4" />}
    </span>
  );

  // Filter orders that have at least one item matching the column status
  // An order should appear in 'pending' column if it has pending items, etc.
  const pendingOrders = orders.filter((o) => 
    o.order_items.some(item => item.status === 'pending')
  );
  const cookingOrders = orders.filter((o) => 
    o.order_items.some(item => item.status === 'cooking')
  );
  const readyOrders = orders.filter((o) => 
    o.order_items.some(item => item.status === 'ready') && 
    !o.order_items.some(item => item.status === 'pending' || item.status === 'cooking')
  );

  if (!currentRestaurant) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <ChefHat className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No Restaurant Selected</h2>
          <p className="text-muted-foreground">Please select or create a restaurant first</p>
        </div>
      </DashboardLayout>
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
      <div className={isMobile ? "w-full" : "flex-1 min-w-[320px]"}>
        {!isMobile && (
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
        )}
        <ScrollArea className={isMobile ? "h-[calc(100vh-280px)] p-2" : "h-[calc(100vh-220px)] bg-muted/30 rounded-b-xl p-3"}>
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
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Print ticket"
                              disabled={printing}
                            >
                              <Printer className="w-3 h-3" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" align="end">
                            <div className="space-y-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start"
                                onClick={() => printKitchenTicket(order)}
                              >
                                <Printer className="w-4 h-4 mr-2" />
                                Browser Print
                              </Button>
                              {isBluetoothAvailable && (
                                <Button
                                  variant={connectedDevice ? "default" : "ghost"}
                                  size="sm"
                                  className={`w-full justify-start ${connectedDevice ? 'bg-success hover:bg-success/90 text-white' : ''}`}
                                  onClick={() => {
                                    if (connectedDevice) {
                                      handleThermalPrint(order);
                                    } else {
                                      setSelectedOrderForPrint(order);
                                      setPrinterSelectorOpen(true);
                                    }
                                  }}
                                  disabled={printing}
                                >
                                  <Bluetooth className="w-4 h-4 mr-2" />
                                  <span className="truncate text-xs">
                                    {connectedDevice ? `${connectedDevice.name}` : 'Connect Printer'}
                                  </span>
                                </Button>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="flex items-center gap-1 text-muted-foreground text-xs">
                          <Timer className="w-3 h-3" />
                          {getTimeSinceOrder(order.created_at)}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 mb-3">
                      {order.order_items
                        .filter((item) => {
                          // Only show items relevant to this column
                          // Pending column: show pending items
                          // Cooking column: show cooking items (and pending that are being started)
                          // Ready column: show ready items
                          if (title === 'Pending') return item.status === 'pending';
                          if (title === 'Cooking') return item.status === 'cooking' || item.status === 'pending';
                          if (title === 'Ready') return item.status === 'ready';
                          return true;
                        })
                        .map((item) => (
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
                            {item.status === 'cooking' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleUpdateItemStatus(item.id, 'ready', order.id)}
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
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between'}`}>
          <div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold flex items-center gap-2`}>
              <ChefHat className={isMobile ? 'w-5 h-5' : 'w-7 h-7'} />
              Kitchen View
            </h1>
            {!isMobile && (
              <p className="text-muted-foreground">Real-time order management for kitchen staff</p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant={soundEnabled ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={soundEnabled ? 'text-primary' : 'text-muted-foreground'}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 sm:mr-2" />
              ) : (
                <VolumeX className="w-4 h-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Sound Off'}</span>
            </Button>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Live
            </div>
          </div>
        </div>

        {loading ? (
          <div className={isMobile ? "space-y-4" : "flex gap-4 overflow-x-auto pb-4"}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={isMobile ? "w-full" : "flex-1 min-w-[320px]"}>
                <div className="h-16 bg-muted rounded-t-xl animate-pulse" />
                <div className="h-[400px] bg-muted/50 rounded-b-xl p-3">
                  <div className="h-32 bg-muted rounded animate-pulse mb-3" />
                  <div className="h-32 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : isMobile ? (
          /* Mobile: Tabbed view */
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending" className="text-xs">
                <Clock className="w-3 h-3 mr-1" />
                Pending ({pendingOrders.length})
              </TabsTrigger>
              <TabsTrigger value="cooking" className="text-xs">
                <Flame className="w-3 h-3 mr-1" />
                Cooking ({cookingOrders.length})
              </TabsTrigger>
              <TabsTrigger value="ready" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Ready ({readyOrders.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-3">
              {renderOrderColumn(
                'Pending',
                pendingOrders,
                Clock,
                'bg-warning/20 text-warning-foreground',
                'cooking',
                'Start Cooking'
              )}
            </TabsContent>
            <TabsContent value="cooking" className="mt-3">
              {renderOrderColumn(
                'Cooking',
                cookingOrders,
                Flame,
                'bg-primary/20 text-primary-foreground',
                'ready',
                'Mark Ready'
              )}
            </TabsContent>
            <TabsContent value="ready" className="mt-3">
              {renderOrderColumn(
                'Ready to Serve',
                readyOrders,
                CheckCircle,
                'bg-success/20 text-success-foreground'
              )}
            </TabsContent>
          </Tabs>
        ) : (
          /* Desktop: Columns view */
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
              'bg-success/20 text-success-foreground'
            )}
          </div>
        )}

        {/* Printer Selector Dialog */}
        <PrinterSelector 
          open={printerSelectorOpen} 
          onOpenChange={(open) => {
            setPrinterSelectorOpen(open);
            if (!open) {
              // After closing, if connected and order selected, print it
              if (connectedDevice && selectedOrderForPrint) {
                handleThermalPrint(selectedOrderForPrint);
                setSelectedOrderForPrint(null);
              }
            }
          }} 
        />
      </div>
    </DashboardLayout>
  );
}
