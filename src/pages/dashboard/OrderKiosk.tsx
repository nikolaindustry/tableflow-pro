import { useEffect, useState, useMemo } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  Receipt
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

  const handleTableClick = async (table: Table) => {
    setSelectedTable(table);
    setCart([]);
    
    // Mark table as occupied if not already
    if (!table.is_occupied) {
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
      // Create order
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
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4" />
                  <span className="text-sm font-medium">Running Order</span>
                  <Badge variant="outline" className="text-xs">
                    {activeOrder.status}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {activeOrder.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.menu_item?.name || 'Item'} x{item.quantity}
                      </span>
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
      </div>
    </div>
  );
}
