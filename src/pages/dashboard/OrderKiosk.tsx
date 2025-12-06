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
  Wallet
} from 'lucide-react';

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
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, status, total_amount, created_at,
          order_items (id, menu_item_id, quantity, unit_price, status)
        `)
        .eq('table_id', tableId)
        .in('status', ['pending', 'cooking'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        // Fetch menu item details for the order items
        const itemsWithDetails = await Promise.all(
          data.order_items.map(async (item: any) => {
            const menuItem = menuItems.find(m => m.id === item.menu_item_id);
            return { ...item, menu_item: menuItem };
          })
        );
        setActiveOrder({ ...data, items: itemsWithDetails });
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
          const updatedItem = payload.new;
          
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
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id, status, total_amount, created_at,
            order_items (id, menu_item_id, quantity, unit_price, status)
          `)
          .eq('table_id', table.id)
          .in('status', ['pending', 'cooking'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!error && data) {
          // Populate cart with existing order items
          const cartItems: CartItem[] = [];
          for (const orderItem of data.order_items) {
            const menuItem = menuItems.find(m => m.id === orderItem.menu_item_id);
            if (menuItem) {
              cartItems.push({
                menuItem,
                quantity: orderItem.quantity
              });
            }
          }
          setCart(cartItems);
          
          // Also fetch menu item details for active order display
          const itemsWithDetails = data.order_items.map((item: any) => ({
            ...item,
            menu_item: menuItems.find(m => m.id === item.menu_item_id)
          }));
          setActiveOrder({ ...data, items: itemsWithDetails });
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
      const existing = prev.find(item => item.menuItem.id === menuItem.id);
      if (existing) {
        return prev.map(item =>
          item.menuItem.id === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { menuItem, quantity: 1 }];
    });
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prev => prev.filter(item => item.menuItem.id !== menuItemId));
  };

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.menuItem.id === menuItemId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0)
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
    if (!selectedTable || !currentRestaurant || cart.length === 0) return;
    
    setSubmitting(true);
    try {
      if (activeOrder) {
        // Update existing order
        const existingItemIds = activeOrder.items.map(i => i.menu_item_id);
        const cartItemIds = cart.map(i => i.menuItem.id);
        
        // Items to add (in cart but not in existing order)
        const itemsToAdd = cart.filter(item => !existingItemIds.includes(item.menuItem.id));
        
        // Items to remove (in existing order but not in cart)
        const itemsToRemove = activeOrder.items.filter(item => !cartItemIds.includes(item.menu_item_id));
        
        // Items to update quantity (in both, but quantity changed)
        const itemsToUpdate = cart.filter(cartItem => {
          const existingItem = activeOrder.items.find(i => i.menu_item_id === cartItem.menuItem.id);
          return existingItem && existingItem.quantity !== cartItem.quantity;
        });

        // Remove items
        if (itemsToRemove.length > 0) {
          const { error } = await supabase
            .from('order_items')
            .delete()
            .in('id', itemsToRemove.map(i => i.id));
          if (error) throw error;
        }

        // Add new items
        if (itemsToAdd.length > 0) {
          const newItems = itemsToAdd.map(item => ({
            order_id: activeOrder.id,
            menu_item_id: item.menuItem.id,
            kitchen_id: item.menuItem.kitchen_id,
            quantity: item.quantity,
            unit_price: item.menuItem.price,
            notes: item.notes || null,
            status: 'pending' as const
          }));
          const { error } = await supabase.from('order_items').insert(newItems);
          if (error) throw error;
        }

        // Update quantities
        for (const cartItem of itemsToUpdate) {
          const existingItem = activeOrder.items.find(i => i.menu_item_id === cartItem.menuItem.id);
          if (existingItem) {
            const { error } = await supabase
              .from('order_items')
              .update({ quantity: cartItem.quantity, status: 'pending' })
              .eq('id', existingItem.id);
            if (error) throw error;
          }
        }

        // Update order total
        const { error: orderError } = await supabase
          .from('orders')
          .update({ total_amount: cartTotal, status: 'pending' })
          .eq('id', activeOrder.id);
        if (orderError) throw orderError;

        toast.success('Order updated!');
      } else {
        // Create new order
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            restaurant_id: currentRestaurant.id,
            table_id: selectedTable.id,
            total_amount: cartTotal,
            status: 'pending'
          })
          .select()
          .single();

        if (orderError) throw orderError;

        // Create order items
        const orderItems = cart.map(item => ({
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
      }
      
      setCart([]);
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

  const grandTotal = useMemo(() => {
    return (activeOrder?.total_amount || 0) + cartTotal;
  }, [activeOrder?.total_amount, cartTotal]);

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

  const printBill = () => {
    if (!selectedTable || !activeOrder || !currentRestaurant) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print the bill');
      return;
    }

    const billDate = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const itemsHtml = activeOrder.items.map(item => `
      <tr>
        <td style="padding: 6px 0;">${item.menu_item?.name || 'Item'}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: right;">₹${item.unit_price.toFixed(2)}</td>
        <td style="text-align: right;">₹${(item.unit_price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bill - ${currentRestaurant.name}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; padding: 20px; max-width: 300px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 18px; margin: 0 0 5px 0; }
            .header p { margin: 2px 0; color: #666; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th { border-bottom: 1px dashed #000; padding: 6px 0; text-align: left; font-size: 11px; }
            th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
            .total-row { border-top: 1px dashed #000; font-weight: bold; }
            .total-row td { padding-top: 10px; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; }
            .divider { border-bottom: 1px dashed #000; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${currentRestaurant.name}</h1>
            ${currentRestaurant.address ? `<p>${currentRestaurant.address}</p>` : ''}
            ${currentRestaurant.phone ? `<p>Phone: ${currentRestaurant.phone}</p>` : ''}
            ${currentRestaurant.gstin ? `<p>GSTIN: ${currentRestaurant.gstin}</p>` : ''}
          </div>
          <div class="divider"></div>
          <p><strong>Table:</strong> ${selectedTable.table_number}</p>
          <p><strong>Date:</strong> ${billDate}</p>
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="divider"></div>
          <table>
            <tr class="total-row">
              <td colspan="3"><strong>Grand Total</strong></td>
              <td style="text-align: right;"><strong>₹${activeOrder.total_amount.toFixed(2)}</strong></td>
            </tr>
          </table>
          <div class="footer">
            <p>Thank you for dining with us!</p>
            <p>Please visit again</p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.print();
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
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold">{currentRestaurant.name}</h1>
          <p className="text-sm text-muted-foreground">Order Kiosk</p>
        </div>
        {selectedTable && (
          <Badge variant="outline" className="text-lg px-4 py-2">
            Table {selectedTable.table_number}
          </Badge>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Tables / Menu */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedTable ? (
            // Table Selection View
            <div className="flex-1 p-4 overflow-auto">
              <Tabs value={selectedFloorId} onValueChange={setSelectedFloorId} className="h-full flex flex-col">
                <TabsList className="shrink-0 mb-4">
                  {floors.map((floor) => (
                    <TabsTrigger key={floor.id} value={floor.id}>
                      {floor.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {floors.map((floor) => (
                  <TabsContent key={floor.id} value={floor.id} className="flex-1 mt-0">
                    {floor.tables.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No tables on this floor
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                        {floor.tables
                          .sort((a, b) => a.table_number.localeCompare(b.table_number))
                          .map((table) => (
                            <button
                              key={table.id}
                              onClick={() => handleTableClick(table)}
                              className={`aspect-square rounded-xl border-2 p-3 transition-all duration-200 hover:scale-105 hover:shadow-lg ${
                                table.is_occupied
                                  ? 'border-destructive/50 bg-destructive/10 hover:border-destructive'
                                  : 'border-success/50 bg-success/10 hover:border-success'
                              }`}
                            >
                              <div className="h-full flex flex-col items-center justify-center">
                                <span className="text-xl font-bold">{table.table_number}</span>
                                <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                                  <Users className="w-3 h-3" />
                                  <span>{table.capacity}</span>
                                </div>
                                <span className={`text-xs mt-1 ${
                                  table.is_occupied ? 'text-destructive' : 'text-success'
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
                    const inCart = cart.find(c => c.menuItem.id === item.id);
                    return (
                      <Card 
                        key={item.id} 
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          inCart ? 'ring-2 ring-primary' : ''
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
                            {inCart && (
                              <Badge variant="secondary" className="text-xs">
                                x{inCart.quantity}
                              </Badge>
                            )}
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

        {/* Right Side - Cart (only when table selected) */}
        {selectedTable && (
          <div className="w-80 lg:w-96 border-l bg-card flex flex-col overflow-hidden">
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
                  cart.map((item) => (
                    <div key={item.menuItem.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.menuItem.name}</p>
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
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Cart Footer */}
            <div className="p-4 border-t space-y-3 shrink-0">
              {cart.length > 0 && (
                <>
                  <div className="flex justify-between text-lg font-bold">
                    <span>New Items Total</span>
                    <span>₹{cartTotal}</span>
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

                  {/* Print Button */}
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={printBill}
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Print Bill
                  </Button>

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
          </div>
        )}
      </div>
    </div>
  );
}
