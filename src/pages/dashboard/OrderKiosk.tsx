import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { 
  Users, 
  Plus, 
  Minus, 
  ShoppingCart, 
  X, 
  Leaf, 
  Drumstick, 
  Flame,
  Send,
  Trash2,
  Search,
  Receipt,
  CheckCircle2,
  Clock,
  ChefHat,
  CreditCard,
  Banknote,
  Printer,
  Wallet,
  Bluetooth,
} from 'lucide-react';
import { useThermalPrinter } from '@/hooks/useThermalPrinter';
import { PrinterSelector } from '@/components/PrinterSelector';
import type { BillData } from '@/services/thermalPrinter';

interface Table {
  id: string;
  table_number: string;
  capacity: number;
  is_occupied: boolean;
  floor_id: string;
}

interface Floor {
  id: string;
  name: string;
  floor_number: number;
  tables: Table[];
}

interface MenuCategory {
  id: string;
  name: string;
  is_active: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  food_type: 'veg' | 'non_veg' | 'egg';
  spice_level: 'mild' | 'medium' | 'spicy' | 'extra_spicy' | null;
  is_available: boolean;
  category_id: string;
  kitchen_id: string | null;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes?: string;
  status?: 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';
}

interface ActiveOrder {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  items: {
    id: string;
    menu_item_id: string;
    quantity: number;
    unit_price: number;
    status: string;
    menu_item?: MenuItem;
  }[];
}

import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const FoodTypeIndicator = ({ type }: { type: 'veg' | 'non_veg' | 'egg' }) => {
  const config = {
    veg: { color: 'bg-success', border: 'border-success' },
    non_veg: { color: 'bg-destructive', border: 'border-destructive' },
    egg: { color: 'bg-warning', border: 'border-warning' },
  };
  const { color, border } = config[type];
  
  return (
    <div className={`w-4 h-4 border-2 ${border} rounded flex items-center justify-center`}>
      <div className={`w-2 h-2 rounded-full ${color}`} />
    </div>
  );
};

const SpiceLevelIndicator = ({ level }: { level: 'mild' | 'medium' | 'spicy' | 'extra_spicy' | null }) => {
  if (!level) return null;
  
  const flames = { mild: 1, medium: 2, spicy: 3, extra_spicy: 4 }[level];
  
  return (
    <div className="flex items-center">
      {Array.from({ length: flames }).map((_, i) => (
        <Flame key={i} className="w-3 h-3 text-orange-500 fill-orange-500" />
      ))}
    </div>
  );
};

export default function OrderKiosk() {
  const { currentRestaurant } = useRestaurant();
  const [floors, setFloors] = useState<Floor[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);
  const [showBillDialog, setShowBillDialog] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [cancelDialogItem, setCancelDialogItem] = useState<{ item: CartItem; orderId: string; itemId: string } | null>(null);
  const [cancellingItem, setCancellingItem] = useState(false);
  const [printerSelectorOpen, setPrinterSelectorOpen] = useState(false);
  const isMobile = useIsMobile();
  
  const { printBill: printThermal, connectedDevice, isBluetoothAvailable, printing } = useThermalPrinter(); // Thermal printer hook

  const fetchData = async () => {
    if (!currentRestaurant) return;

    try {
      const [floorsRes, categoriesRes] = await Promise.all([
        supabase
          .from('floors')
          .select('*, tables(*)')
          .eq('restaurant_id', currentRestaurant.id)
          .order('floor_number', { ascending: true }),
        supabase
          .from('menu_categories')
          .select('id, name, is_active')
          .eq('restaurant_id', currentRestaurant.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
      ]);

      if (floorsRes.error) throw floorsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setFloors(floorsRes.data || []);
      setCategories(categoriesRes.data || []);
      
      if (floorsRes.data && floorsRes.data.length > 0 && !selectedFloorId) {
        setSelectedFloorId(floorsRes.data[0].id);
      }

      // Fetch menu items for all categories
      if (categoriesRes.data && categoriesRes.data.length > 0) {
        const categoryIds = categoriesRes.data.map(c => c.id);
        const { data: itemsData, error: itemsError } = await supabase
          .from('menu_items')
          .select('*')
          .in('category_id', categoryIds)
          .eq('is_available', true);

        if (!itemsError) {
          setMenuItems(itemsData || []);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveOrder = async (tableId: string) => {
    try {
      // Fetch ALL active orders for this table (not just one)
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, total_amount, created_at,
          order_items (id, menu_item_id, quantity, unit_price, status)
        `)
        .eq('table_id', tableId)
        .in('status', ['pending', 'cooking', 'ready'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      if (data && data.length > 0) {
        // Combine all orders into one consolidated view
        const allItems: any[] = [];
        let totalAmount = 0;
        
        for (const order of data) {
          totalAmount += order.total_amount;
          for (const item of order.order_items) {
            // Skip served items - they shouldn't appear in active order view
            if (item.status === 'served') continue;
            const menuItem = menuItems.find(m => m.id === item.menu_item_id);
            allItems.push({ ...item, menu_item: menuItem, order_id: order.id });
          }
        }
        
        // Use the first order as the base but include all items
        setActiveOrder({ 
          ...data[0], 
          items: allItems,
          total_amount: totalAmount
        });
      } else {
        setActiveOrder(null);
      }
    } catch (error) {
      console.error('Error fetching active order:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentRestaurant]);

  useEffect(() => {
    if (selectedTable && menuItems.length > 0) {
      fetchActiveOrder(selectedTable.id);
    }
  }, [selectedTable, menuItems]);

  // Real-time subscription for order updates
  useEffect(() => {
    if (!selectedTable || !activeOrder) return;

    console.log('Setting up realtime subscription for order:', activeOrder.id);

    // Subscribe to order status changes
    const orderChannel = supabase
      .channel(`order-${activeOrder.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${activeOrder.id}`
        },
        (payload) => {
          console.log('Order updated:', payload);
          const newStatus = payload.new.status;
          setActiveOrder(prev => prev ? { ...prev, status: newStatus } : null);
          
          if (newStatus === 'ready') {
            toast.success('Order is ready for serving!', {
              icon: <CheckCircle2 className="w-5 h-5 text-success" />,
              duration: 5000
            });
          } else if (newStatus === 'cooking') {
            toast.info('Kitchen started cooking your order', {
              icon: <ChefHat className="w-5 h-5" />,
              duration: 3000
            });
          }
        }
      )
      .subscribe();

    // Subscribe to order item status changes
    const itemsChannel = supabase
      .channel(`order-items-${activeOrder.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_items',
          filter: `order_id=eq.${activeOrder.id}`
        },
        (payload) => {
          console.log('Order item updated:', payload);
          const updatedItem = payload.new as any;
          
          setActiveOrder(prev => {
            if (!prev) return null;
            return {
              ...prev,
              items: prev.items.map(item =>
                item.id === updatedItem.id
                  ? { ...item, status: updatedItem.status }
                  : item
              )
            };
          });

          // Also update cart item status - only for items that ALREADY have a status (existing order items)
          // New items (without status) should NOT be affected by status updates from existing items
          setCart(prev => prev.map(cartItem => {
            // Only update if this cart item already has a status (is an existing order item)
            // AND matches the updated item's menu_item_id
            if (cartItem.status && cartItem.menuItem.id === updatedItem.menu_item_id) {
              return { ...cartItem, status: updatedItem.status };
            }
            return cartItem;
          }));

          // Find the item name for the toast
          const itemName = activeOrder.items.find(i => i.id === updatedItem.id)?.menu_item?.name || 'Item';
          
          if (updatedItem.status === 'ready') {
            toast.success(`${itemName} is ready!`, {
              icon: <CheckCircle2 className="w-5 h-5 text-success" />,
              duration: 4000
            });
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up realtime subscriptions');
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(itemsChannel);
    };
  }, [selectedTable?.id, activeOrder?.id]);

  // Real-time subscription for table status changes
  useEffect(() => {
    if (!currentRestaurant) return;

    const tablesChannel = supabase
      .channel('tables-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tables',
        },
        (payload) => {
          console.log('Table status updated:', payload);
          const updatedTable = payload.new as any;
          
          // Update local floors/tables state
          setFloors(prev => prev.map(floor => ({
            ...floor,
            tables: floor.tables.map(table =>
              table.id === updatedTable.id
                ? { ...table, is_occupied: updatedTable.is_occupied }
                : table
            )
          })));

          // If this is the selected table and it was freed, show notification
          if (selectedTable?.id === updatedTable.id && !updatedTable.is_occupied) {
            toast.info('Table has been freed');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tablesChannel);
    };
  }, [currentRestaurant, selectedTable?.id]);

  const handleTableClick = async (table: Table) => {
    setSelectedTable(table);
    setCart([]);
    
    // If table is occupied, load existing order items into cart
    if (table.is_occupied) {
      try {
        // Fetch ALL active orders for this table
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id, status, total_amount, created_at,
            order_items (id, menu_item_id, quantity, unit_price, status)
          `)
          .eq('table_id', table.id)
          .in('status', ['pending', 'cooking', 'ready'])
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          // Populate cart with ALL existing order items from ALL orders
          const cartItems: CartItem[] = [];
          const allItems: any[] = [];
          let totalAmount = 0;
          
          for (const order of data) {
            totalAmount += order.total_amount;
            for (const orderItem of order.order_items) {
              // Skip served items - they should not appear in the cart
              if (orderItem.status === 'served') continue;
              
              const menuItem = menuItems.find(m => m.id === orderItem.menu_item_id);
              if (menuItem) {
                // Check if already in cart with SAME status (avoid duplicates)
                const existingCartItem = cartItems.find(
                  c => c.menuItem.id === menuItem.id && c.status === orderItem.status
                );
                if (existingCartItem) {
                  existingCartItem.quantity += orderItem.quantity;
                } else {
                  cartItems.push({
                    menuItem,
                    quantity: orderItem.quantity,
                    status: orderItem.status
                  });
                }
                allItems.push({
                  ...orderItem,
                  menu_item: menuItem,
                  order_id: order.id
                });
              }
            }
          }
          setCart(cartItems);
          
          // Use the first order as base with combined items
          setActiveOrder({ 
            ...data[0], 
            items: allItems,
            total_amount: totalAmount
          });
        }
      } catch (error) {
        console.error('Error fetching existing order:', error);
      }
    } else {
      // Mark table as occupied if not already
      await supabase
        .from('tables')
        .update({ is_occupied: true })
        .eq('id', table.id);
      
      // Update local state
      setFloors(floors.map(f => ({
        ...f,
        tables: f.tables.map(t => 
          t.id === table.id ? { ...t, is_occupied: true } : t
        )
      })));
    }
  };

  const handleCloseOrder = () => {
    setSelectedTable(null);
    setCart([]);
    setActiveOrder(null);
    setSearchQuery('');
    setSelectedCategoryId('all');
  };

  const addToCart = (menuItem: MenuItem) => {
    setCart(prev => {
      // Look for an existing NEW item (without status) for this menu item
      const existingNewItem = prev.find(item => item.menuItem.id === menuItem.id && !item.status);
      
      if (existingNewItem) {
        // Increment quantity of existing new item
        return prev.map(item =>
          item.menuItem.id === menuItem.id && !item.status
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      
      // Add as a new item (even if same item exists with a status like ready/cooking)
      return [...prev, { menuItem, quantity: 1 }];
    });
  };

  const removeFromCart = (menuItemId: string) => {
    // Only remove NEW items (without status)
    setCart(prev => prev.filter(item => !(item.menuItem.id === menuItemId && !item.status)));
  };

  // Cancel/modify existing order items
  const cancelOrderItem = async (orderId: string, itemId: string, menuItemId: string, currentQuantity: number, reduceBy?: number) => {
    setCancellingItem(true);
    try {
      if (reduceBy && reduceBy < currentQuantity) {
        // Reduce quantity
        const newQuantity = currentQuantity - reduceBy;
        const { error } = await supabase
          .from('order_items')
          .update({ quantity: newQuantity })
          .eq('id', itemId);
        
        if (error) throw error;
        
        // Update cart
        setCart(prev => prev.map(item => 
          item.menuItem.id === menuItemId && item.status
            ? { ...item, quantity: newQuantity }
            : item
        ));
        
        // Update active order
        setActiveOrder(prev => {
          if (!prev) return null;
          const updatedItems = prev.items.map(item =>
            item.id === itemId ? { ...item, quantity: newQuantity } : item
          );
          const newTotal = updatedItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
          return { ...prev, items: updatedItems, total_amount: newTotal };
        });
        
        toast.success('Item quantity updated');
      } else {
        // Cancel entire item (set status to cancelled)
        const { error } = await supabase
          .from('order_items')
          .update({ status: 'cancelled' })
          .eq('id', itemId);
        
        if (error) throw error;
        
        // Remove from cart
        setCart(prev => prev.filter(item => !(item.menuItem.id === menuItemId && item.status)));
        
        // Remove from active order and recalculate total
        setActiveOrder(prev => {
          if (!prev) return null;
          const updatedItems = prev.items.filter(item => item.id !== itemId);
          const newTotal = updatedItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
          return { ...prev, items: updatedItems, total_amount: newTotal };
        });
        
        toast.success('Item cancelled');
      }
      
      setCancelDialogItem(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel item');
    } finally {
      setCancellingItem(false);
    }
  };

  // Find order item ID for a cart item
  const findOrderItemId = (menuItemId: string, status: string): { orderId: string; itemId: string } | null => {
    if (!activeOrder) return null;
    const orderItem = activeOrder.items.find(
      item => item.menu_item_id === menuItemId && item.status === status
    );
    if (orderItem) {
      return { orderId: (orderItem as any).order_id || activeOrder.id, itemId: orderItem.id };
    }
    return null;
  };

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart(prev =>
      prev.map(item => {
        // Only update NEW items (without status)
        if (item.menuItem.id === menuItemId && !item.status) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0 || item.status) // Keep existing order items even if somehow quantity becomes 0
    );
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.menuItem.price * item.quantity, 0);
  }, [cart]);

  const filteredMenuItems = useMemo(() => {
    let items = menuItems;
    
    if (selectedCategoryId !== 'all') {
      items = items.filter(item => item.category_id === selectedCategoryId);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      );
    }
    
    return items;
  }, [menuItems, selectedCategoryId, searchQuery]);

  const submitOrder = async () => {
    if (!selectedTable || !currentRestaurant) return;
    
    // Only submit NEW items (items without a status)
    const newItems = cart.filter(item => !item.status);
    
    if (newItems.length === 0) {
      toast.info('No new items to send to kitchen');
      return;
    }
    
    setSubmitting(true);
    try {
      // Always create a new order for new items
      // This ensures proper tracking and billing for items ordered after previous orders were served
      const newItemsTotal = newItems.reduce((sum, item) => sum + item.menuItem.price * item.quantity, 0);
      
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: currentRestaurant.id,
          table_id: selectedTable.id,
          total_amount: newItemsTotal,
          status: 'pending'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items only for new items
      const orderItems = newItems.map(item => ({
        order_id: order.id,
        menu_item_id: item.menuItem.id,
        kitchen_id: item.menuItem.kitchen_id,
        quantity: item.quantity,
        unit_price: item.menuItem.price,
        notes: item.notes || null,
        status: 'pending' as const
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      toast.success('Order sent to kitchen!');
      
      // Clear only new items from cart, keep existing order items
      setCart(prev => prev.filter(item => item.status));
      
      // Refresh active order to include the new order
      fetchActiveOrder(selectedTable.id);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit order');
    } finally {
      setSubmitting(false);
    }
  };

  const markTableFree = async () => {
    if (!selectedTable) return;
    
    try {
      await supabase
        .from('tables')
        .update({ is_occupied: false })
        .eq('id', selectedTable.id);
      
      // Update local state
      setFloors(floors.map(f => ({
        ...f,
        tables: f.tables.map(t => 
          t.id === selectedTable.id ? { ...t, is_occupied: false } : t
        )
      })));
      
      handleCloseOrder();
      toast.success('Table marked as available');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // grandTotal is simply the cartTotal since the cart always reflects all items
  // (both from active orders and newly added items)
  const grandTotal = useMemo(() => {
    return cartTotal;
  }, [cartTotal]);

  // Check if there are new items to send (items without a status are new)
  const hasNewItems = useMemo(() => {
    return cart.some(item => !item.status);
  }, [cart]);

  // Calculate total for only new items
  const newItemsTotal = useMemo(() => {
    return cart
      .filter(item => !item.status)
      .reduce((sum, item) => sum + (item.menuItem.price * item.quantity), 0);
  }, [cart]);

  const processPayment = async (paymentMethod: 'cash' | 'card' | 'upi') => {
    if (!selectedTable || !activeOrder) return;
    
    setProcessingPayment(true);
    try {
      // Mark all orders for this table as served
      await supabase
        .from('orders')
        .update({ status: 'served' })
        .eq('table_id', selectedTable.id)
        .in('status', ['pending', 'cooking', 'ready']);

      // Mark table as free
      await supabase
        .from('tables')
        .update({ is_occupied: false })
        .eq('id', selectedTable.id);

      // Update local floors state
      setFloors(floors.map(f => ({
        ...f,
        tables: f.tables.map(t => 
          t.id === selectedTable.id ? { ...t, is_occupied: false } : t
        )
      })));

      setShowBillDialog(false);
      toast.success(`Payment received via ${paymentMethod.toUpperCase()}`);
      handleCloseOrder();
    } catch (error: any) {
      toast.error(error.message || 'Failed to process payment');
    } finally {
      setProcessingPayment(false);
    }
  };

  const getBillData = useCallback((): BillData | null => {
    if (!selectedTable || !activeOrder || !currentRestaurant) return null;
    
    return {
      restaurantName: currentRestaurant.name,
      restaurantAddress: currentRestaurant.address,
      restaurantPhone: currentRestaurant.phone,
      restaurantGstin: currentRestaurant.gstin,
      tableNumber: selectedTable.table_number,
      items: activeOrder.items.map(item => ({
        name: item.menu_item?.name || 'Item',
        quantity: item.quantity,
        price: item.unit_price,
      })),
      total: activeOrder.total_amount,
    };
  }, [selectedTable, activeOrder, currentRestaurant]);

  const handlePrintBill = async (useBluetooth: boolean = false) => {
    const billData = getBillData();
    if (!billData) return;
    
    try {
      await printThermal(billData, useBluetooth);
      if (useBluetooth) {
        toast.success('Bill printed via Bluetooth');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (!currentRestaurant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-4">
        <ShoppingCart className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold">No Restaurant Selected</h2>
        <p className="text-muted-foreground">Please select or create a restaurant first</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const selectedFloor = floors.find(f => f.id === selectedFloorId);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold">{currentRestaurant.name}</h1>
          <p className="text-sm text-muted-foreground">Order Kiosk</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedTable && isMobile && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowMobileCart(true)}
              className="relative"
            >
              <ShoppingCart className="w-4 h-4" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </Button>
          )}
          {selectedTable && (
            <Badge variant="outline" className="text-lg px-4 py-2">
              Table {selectedTable.table_number}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Tables / Menu */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedTable ? (
            // Table Selection View
            <div className="flex-1 p-6 overflow-auto">
              <div className="max-w-6xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Select a Table</h2>
                  <p className="text-muted-foreground">Choose a table to start taking orders</p>
                </div>
                
                <Tabs value={selectedFloorId} onValueChange={setSelectedFloorId} className="h-full flex flex-col">
                  <div className="flex justify-start mb-8">
                    <TabsList className="bg-secondary/50 p-1.5 rounded-2xl shadow-sm">
                      {floors.map((floor) => (
                        <TabsTrigger 
                          key={floor.id} 
                          value={floor.id}
                          className="data-[state=active]:bg-card data-[state=active]:shadow-md rounded-xl px-6 py-2.5 font-medium transition-all"
                        >
                          {floor.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  {floors.map((floor) => (
                    <TabsContent key={floor.id} value={floor.id} className="flex-1 mt-0 animate-fade-in">
                      {floor.tables.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                          <Users className="w-12 h-12 mb-4 opacity-30" />
                          <p className="text-lg">No tables on this floor</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                          {floor.tables
                            .sort((a, b) => a.table_number.localeCompare(b.table_number))
                            .map((table) => (
                              <button
                                key={table.id}
                                onClick={() => handleTableClick(table)}
                                className={`group relative rounded-2xl p-5 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 ${
                                  table.is_occupied
                                    ? 'bg-gradient-to-br from-destructive/5 to-destructive/15 border-2 border-destructive/30 hover:border-destructive/50 hover:shadow-lg hover:shadow-destructive/10'
                                    : 'bg-gradient-to-br from-success/5 to-success/15 border-2 border-success/30 hover:border-success/50 hover:shadow-lg hover:shadow-success/10'
                                }`}
                              >
                                {/* Status indicator dot */}
                                <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${
                                  table.is_occupied 
                                    ? 'bg-destructive animate-pulse' 
                                    : 'bg-success'
                                }`} />
                                
                                <div className="flex flex-col items-center justify-center py-3">
                                  {/* Table icon/representation */}
                                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                                    table.is_occupied
                                      ? 'bg-destructive/10 group-hover:bg-destructive/15'
                                      : 'bg-success/10 group-hover:bg-success/15'
                                  }`}>
                                    <span className={`text-2xl font-bold ${
                                      table.is_occupied ? 'text-destructive' : 'text-success'
                                    }`}>
                                      {table.table_number}
                                    </span>
                                  </div>
                                  
                                  {/* Capacity */}
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                                    <Users className="w-4 h-4" />
                                    <span className="text-sm font-medium">{table.capacity} seats</span>
                                  </div>
                                  
                                  {/* Status badge */}
                                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                                    table.is_occupied 
                                      ? 'bg-destructive/15 text-destructive' 
                                      : 'bg-success/15 text-success'
                                  }`}>
                                    {table.is_occupied ? 'Occupied' : 'Available'}
                                  </span>
                                </div>
                              </button>
                            ))}
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </div>
          ) : (
            // Menu Selection View
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Search & Categories */}
              <div className="p-4 border-b space-y-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search menu..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <ScrollArea className="w-full">
                  <div className="flex gap-2 pb-1">
                    <Button
                      size="sm"
                      variant={selectedCategoryId === 'all' ? 'default' : 'outline'}
                      onClick={() => setSelectedCategoryId('all')}
                    >
                      All
                    </Button>
                    {categories.map((cat) => (
                      <Button
                        key={cat.id}
                        size="sm"
                        variant={selectedCategoryId === cat.id ? 'default' : 'outline'}
                        onClick={() => setSelectedCategoryId(cat.id)}
                      >
                        {cat.name}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Menu Items Grid */}
              <ScrollArea className="flex-1 p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredMenuItems.map((item) => {
                    // Count existing order items (with status) and new items separately
                    const existingItem = cart.find(c => c.menuItem.id === item.id && c.status);
                    const newItem = cart.find(c => c.menuItem.id === item.id && !c.status);
                    const hasAnyInCart = existingItem || newItem;
                    
                    return (
                      <Card 
                        key={item.id} 
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          newItem ? 'ring-2 ring-primary' : existingItem ? 'ring-1 ring-muted-foreground' : ''
                        }`}
                        onClick={() => addToCart(item)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <FoodTypeIndicator type={item.food_type} />
                            <SpiceLevelIndicator level={item.spice_level} />
                          </div>
                          <h3 className="font-semibold mt-2 line-clamp-2">{item.name}</h3>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-3">
                            <span className="font-bold text-primary">₹{item.price}</span>
                            <div className="flex items-center gap-1">
                              {existingItem && (
                                <Badge variant="outline" className="text-xs border-muted-foreground text-muted-foreground">
                                  x{existingItem.quantity}
                                </Badge>
                              )}
                              {newItem && (
                                <Badge variant="default" className="text-xs">
                                  +{newItem.quantity}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Right Side - Cart (only when table selected, hidden on mobile) */}
        {selectedTable && !isMobile && (
          <div className="w-[380px] lg:w-[440px] xl:w-[480px] border-l bg-card flex flex-col overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span className="font-semibold">Current Order</span>
              </div>
              <Button size="icon" variant="ghost" onClick={handleCloseOrder}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Active Order Items */}
            {activeOrder && activeOrder.items.length > 0 && (
              <div className="p-3 border-b bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="w-4 h-4" />
                  <span className="text-sm font-medium">Running Order</span>
                  <Badge 
                    variant={activeOrder.status === 'ready' ? 'default' : 'outline'} 
                    className={`text-xs ${
                      activeOrder.status === 'ready' 
                        ? 'bg-success text-success-foreground' 
                        : activeOrder.status === 'cooking'
                        ? 'border-warning text-warning'
                        : ''
                    }`}
                  >
                    {activeOrder.status === 'cooking' && <ChefHat className="w-3 h-3 mr-1" />}
                    {activeOrder.status === 'ready' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {activeOrder.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                    {activeOrder.status}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {activeOrder.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {item.status === 'ready' ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : item.status === 'cooking' ? (
                          <ChefHat className="w-4 h-4 text-warning animate-pulse" />
                        ) : (
                          <Clock className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={item.status === 'ready' ? 'text-success' : 'text-muted-foreground'}>
                          {item.menu_item?.name || 'Item'} x{item.quantity}
                        </span>
                      </div>
                      <span>₹{item.unit_price * item.quantity}</span>
                    </div>
                  ))}
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between text-sm font-medium">
                  <span>Subtotal</span>
                  <span>₹{activeOrder.total_amount}</span>
                </div>
              </div>
            )}

            {/* Cart Items */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Tap items to add to order</p>
                  </div>
                ) : (
                  <>
                    {/* Existing Order Items (items with status) */}
                    {cart.filter(item => item.status && item.status !== 'cancelled').length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                          <Receipt className="w-4 h-4" />
                          <span>Existing Order</span>
                        </div>
                        {cart.filter(item => item.status && item.status !== 'cancelled').map((item) => {
                          const orderInfo = findOrderItemId(item.menuItem.id, item.status || '');
                          const isPending = item.status === 'pending';
                          const isCooking = item.status === 'cooking';
                          
                          return (
                            <div key={`${item.menuItem.id}-${item.status}`} className="flex items-center gap-2 bg-muted/30 border border-border/50 rounded-lg p-3">
                              <div className="flex-1 min-w-0">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs mb-1 ${
                                    item.status === 'ready' 
                                      ? 'border-success text-success bg-success/10' 
                                      : item.status === 'cooking'
                                      ? 'border-warning text-warning bg-warning/10'
                                      : 'border-muted-foreground'
                                  }`}
                                >
                                  {item.status === 'cooking' && <ChefHat className="w-3 h-3 mr-1" />}
                                  {item.status === 'ready' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                  {item.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                                  {item.status}
                                </Badge>
                                <p className="font-medium truncate">{item.menuItem.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  ₹{item.menuItem.price} each
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Pending items: allow direct quantity edit and cancel */}
                                {isPending && orderInfo && (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-7 w-7"
                                      disabled={item.quantity <= 1}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        cancelOrderItem(orderInfo.orderId, orderInfo.itemId, item.menuItem.id, item.quantity, 1);
                                      }}
                                    >
                                      <Minus className="w-3 h-3" />
                                    </Button>
                                    <span className="w-6 text-center font-medium text-muted-foreground">{item.quantity}</span>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        cancelOrderItem(orderInfo.orderId, orderInfo.itemId, item.menuItem.id, item.quantity);
                                      }}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </>
                                )}
                                {/* Cooking items: show cancel with confirmation */}
                                {isCooking && orderInfo && (
                                  <>
                                    <span className="w-6 text-center font-medium text-muted-foreground">x{item.quantity}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCancelDialogItem({ item, orderId: orderInfo.orderId, itemId: orderInfo.itemId });
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                )}
                                {/* Ready items: display only, no cancel */}
                                {item.status === 'ready' && (
                                  <>
                                    <span className="w-8 text-center font-medium text-muted-foreground">x{item.quantity}</span>
                                  </>
                                )}
                                <span className="font-medium w-14 text-right shrink-0">₹{item.menuItem.price * item.quantity}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Separator between existing and new items */}
                    {cart.filter(item => item.status && item.status !== 'cancelled').length > 0 && cart.filter(item => !item.status).length > 0 && (
                      <div className="relative py-2">
                        <Separator />
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                          Adding New Items
                        </span>
                      </div>
                    )}

                    {/* New Items (items without status) */}
                    {cart.filter(item => !item.status).length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                          <Plus className="w-4 h-4" />
                          <span>New Items</span>
                        </div>
                        {cart.filter(item => !item.status).map((item) => (
                          <div key={item.menuItem.id} className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{item.menuItem.name}</p>
                                <Badge variant="secondary" className="text-xs">New</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                ₹{item.menuItem.price} each
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(item.menuItem.id, -1);
                                }}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-8 text-center font-medium">{item.quantity}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(item.menuItem.id, 1);
                                }}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFromCart(item.menuItem.id);
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Cart Footer */}
            <div className="p-4 border-t space-y-3 shrink-0">
              {hasNewItems && (
                <>
                  <div className="flex justify-between text-lg font-bold">
                    <span>New Items Total</span>
                    <span>₹{newItemsTotal}</span>
                  </div>
                  <Button 
                    className="w-full" 
                    size="lg" 
                    onClick={submitOrder}
                    disabled={submitting}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {submitting ? 'Sending...' : 'Send to Kitchen'}
                  </Button>
                </>
              )}
              {activeOrder && activeOrder.items.length > 0 && (
                <Button 
                  className="w-full bg-success hover:bg-success/90"
                  size="lg"
                  onClick={() => setShowBillDialog(true)}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Generate Bill (₹{grandTotal})
                </Button>
              )}
              <Button 
                variant="outline" 
                className="w-full"
                onClick={markTableFree}
              >
                Mark Table Available
              </Button>
            </div>
          </div>
        )}

        {/* Mobile Cart Sheet */}
        {selectedTable && isMobile && (
          <Sheet open={showMobileCart} onOpenChange={setShowMobileCart}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
              <SheetHeader className="p-4 border-b shrink-0">
                <SheetTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Current Order - Table {selectedTable.table_number}
                </SheetTitle>
              </SheetHeader>

              {/* Active Order Items */}
              {activeOrder && activeOrder.items.length > 0 && (
                <div className="p-3 border-b bg-muted/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Receipt className="w-4 h-4" />
                    <span className="text-sm font-medium">Running Order</span>
                    <Badge 
                      variant={activeOrder.status === 'ready' ? 'default' : 'outline'} 
                      className={`text-xs ${
                        activeOrder.status === 'ready' 
                          ? 'bg-success text-success-foreground' 
                          : activeOrder.status === 'cooking'
                          ? 'border-warning text-warning'
                          : ''
                      }`}
                    >
                      {activeOrder.status === 'cooking' && <ChefHat className="w-3 h-3 mr-1" />}
                      {activeOrder.status === 'ready' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {activeOrder.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                      {activeOrder.status}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {activeOrder.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {item.status === 'ready' ? (
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          ) : item.status === 'cooking' ? (
                            <ChefHat className="w-4 h-4 text-warning animate-pulse" />
                          ) : (
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className={item.status === 'ready' ? 'text-success' : 'text-muted-foreground'}>
                            {item.menu_item?.name || 'Item'} x{item.quantity}
                          </span>
                        </div>
                        <span>₹{item.unit_price * item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-sm font-medium">
                    <span>Subtotal</span>
                    <span>₹{activeOrder.total_amount}</span>
                  </div>
                </div>
              )}

              {/* Cart Items */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Tap items to add to order</p>
                    </div>
                  ) : (
                    <>
                      {/* Existing Order Items (items with status) */}
                      {cart.filter(item => item.status && item.status !== 'cancelled').length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                            <Receipt className="w-4 h-4" />
                            <span>Existing Order</span>
                          </div>
                          {cart.filter(item => item.status && item.status !== 'cancelled').map((item) => {
                            const orderInfo = findOrderItemId(item.menuItem.id, item.status || '');
                            const isPending = item.status === 'pending';
                            const isCooking = item.status === 'cooking';
                            
                            return (
                              <div key={`${item.menuItem.id}-${item.status}`} className="flex items-center gap-2 bg-muted/30 border border-border/50 rounded-lg p-3">
                                <div className="flex-1 min-w-0">
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs mb-1 ${
                                      item.status === 'ready' 
                                        ? 'border-success text-success bg-success/10' 
                                        : item.status === 'cooking'
                                        ? 'border-warning text-warning bg-warning/10'
                                        : 'border-muted-foreground'
                                    }`}
                                  >
                                    {item.status === 'cooking' && <ChefHat className="w-3 h-3 mr-1" />}
                                    {item.status === 'ready' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                    {item.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                                    {item.status}
                                  </Badge>
                                  <p className="font-medium truncate">{item.menuItem.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    ₹{item.menuItem.price} each
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {isPending && orderInfo && (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-7 w-7"
                                        disabled={item.quantity <= 1}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          cancelOrderItem(orderInfo.orderId, orderInfo.itemId, item.menuItem.id, item.quantity, 1);
                                        }}
                                      >
                                        <Minus className="w-3 h-3" />
                                      </Button>
                                      <span className="w-6 text-center font-medium text-muted-foreground">{item.quantity}</span>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          cancelOrderItem(orderInfo.orderId, orderInfo.itemId, item.menuItem.id, item.quantity);
                                        }}
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </>
                                  )}
                                  {isCooking && orderInfo && (
                                    <>
                                      <span className="w-6 text-center font-medium text-muted-foreground">x{item.quantity}</span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCancelDialogItem({ item, orderId: orderInfo.orderId, itemId: orderInfo.itemId });
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </>
                                  )}
                                  {item.status === 'ready' && (
                                    <span className="w-8 text-center font-medium text-muted-foreground">x{item.quantity}</span>
                                  )}
                                  <span className="font-medium w-14 text-right shrink-0">₹{item.menuItem.price * item.quantity}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Separator between existing and new items */}
                      {cart.filter(item => item.status && item.status !== 'cancelled').length > 0 && cart.filter(item => !item.status).length > 0 && (
                        <div className="relative py-2">
                          <Separator />
                          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                            Adding New Items
                          </span>
                        </div>
                      )}

                      {/* New Items (items without status) */}
                      {cart.filter(item => !item.status).length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                            <Plus className="w-4 h-4" />
                            <span>New Items</span>
                          </div>
                          {cart.filter(item => !item.status).map((item) => (
                            <div key={item.menuItem.id} className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{item.menuItem.name}</p>
                                  <Badge variant="secondary" className="text-xs">New</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  ₹{item.menuItem.price} each
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateQuantity(item.menuItem.id, -1);
                                  }}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="w-6 text-center font-medium">{item.quantity}</span>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateQuantity(item.menuItem.id, 1);
                                  }}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromCart(item.menuItem.id);
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>

              {/* Cart Footer */}
              <div className="p-4 border-t space-y-3 shrink-0">
                {hasNewItems && (
                  <>
                    <div className="flex justify-between text-lg font-bold">
                      <span>New Items Total</span>
                      <span>₹{newItemsTotal}</span>
                    </div>
                    <Button 
                      className="w-full" 
                      size="lg" 
                      onClick={() => {
                        submitOrder();
                        setShowMobileCart(false);
                      }}
                      disabled={submitting}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {submitting ? 'Sending...' : 'Send to Kitchen'}
                    </Button>
                  </>
                )}
                {activeOrder && activeOrder.items.length > 0 && (
                  <Button 
                    className="w-full bg-success hover:bg-success/90"
                    size="lg"
                    onClick={() => {
                      setShowBillDialog(true);
                      setShowMobileCart(false);
                    }}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Generate Bill (₹{grandTotal})
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    markTableFree();
                    setShowMobileCart(false);
                  }}
                >
                  Mark Table Available
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* Billing Dialog */}
      <Dialog open={showBillDialog} onOpenChange={setShowBillDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Bill for Table {selectedTable?.table_number}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Bill Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              {activeOrder?.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.menu_item?.name || 'Item'} x{item.quantity}</span>
                  <span>₹{(item.unit_price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-lg">
                <span>Grand Total</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Print Options */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => handlePrintBill(false)} disabled={printing}>
                <Printer className="w-4 h-4 mr-2" />
                Browser Print
              </Button>
              {isBluetoothAvailable && (
                <Button 
                  variant="outline" 
                  className={`flex-1 ${connectedDevice ? 'border-success text-success' : ''}`}
                  onClick={() => connectedDevice ? handlePrintBill(true) : setPrinterSelectorOpen(true)}
                  disabled={printing}
                >
                  <Bluetooth className="w-4 h-4 mr-2" />
                  {connectedDevice ? 'Thermal Print' : 'Connect Printer'}
                </Button>
              )}
            </div>

            {/* Payment Methods */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Select Payment Method</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => processPayment('cash')}
                  disabled={processingPayment}
                >
                  <Banknote className="w-6 h-6" />
                  <span>Cash</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => processPayment('card')}
                  disabled={processingPayment}
                >
                  <CreditCard className="w-6 h-6" />
                  <span>Card</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => processPayment('upi')}
                  disabled={processingPayment}
                >
                  <Wallet className="w-6 h-6" />
                  <span>UPI</span>
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowBillDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Cooking Item Confirmation Dialog */}
      <AlertDialog open={!!cancelDialogItem} onOpenChange={(open) => !open && setCancelDialogItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Cooking Item?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelDialogItem && (
                <>
                  The kitchen has already started cooking <strong>{cancelDialogItem.item.menuItem.name}</strong> (x{cancelDialogItem.item.quantity}).
                  <br /><br />
                  Are you sure you want to cancel this item? This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingItem}>Keep Item</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancellingItem}
              onClick={() => {
                if (cancelDialogItem) {
                  cancelOrderItem(
                    cancelDialogItem.orderId,
                    cancelDialogItem.itemId,
                    cancelDialogItem.item.menuItem.id,
                    cancelDialogItem.item.quantity
                  );
                }
              }}
            >
              {cancellingItem ? 'Cancelling...' : 'Cancel Item'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Printer Selector Dialog */}
      <PrinterSelector open={printerSelectorOpen} onOpenChange={setPrinterSelectorOpen} />
    </div>
  );
}
