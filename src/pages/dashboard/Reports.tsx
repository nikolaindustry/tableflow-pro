import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { 
  CalendarIcon, 
  IndianRupee, 
  ShoppingBag, 
  TrendingUp, 
  Clock,
  Utensils,
  Flame,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileText
} from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, eachDayOfInterval, eachHourOfInterval, startOfToday, addHours } from 'date-fns';
import { cn } from '@/lib/utils';

type OrderStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';

interface Order {
  id: string;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  notes: string | null;
  table_id: string | null;
  table?: { table_number: string } | null;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number;
    menu_item: {
      name: string;
      food_type: string;
    } | null;
  }[];
}

interface MenuItem {
  name: string;
  quantity: number;
  revenue: number;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'status-pending' },
  cooking: { label: 'Cooking', className: 'status-cooking' },
  ready: { label: 'Ready', className: 'status-ready' },
  served: { label: 'Served', className: 'status-served' },
  cancelled: { label: 'Cancelled', className: 'bg-destructive/10 text-destructive' },
};

const CHART_COLORS = [
  'hsl(18, 76%, 52%)',   // primary
  'hsl(38, 92%, 50%)',   // accent
  'hsl(142, 76%, 36%)',  // success
  'hsl(220, 70%, 50%)',  // blue
  'hsl(280, 70%, 50%)',  // purple
  'hsl(180, 70%, 40%)',  // teal
];

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export default function Reports() {
  const { currentRestaurant } = useRestaurant();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;

  // Calculate date range
  const getDateRange = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'yesterday':
        return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case 'week':
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'month':
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'custom':
        return { 
          from: customDateFrom ? startOfDay(customDateFrom) : startOfDay(now), 
          to: customDateTo ? endOfDay(customDateTo) : endOfDay(now) 
        };
      default:
        return { from: startOfDay(now), to: endOfDay(now) };
    }
  }, [dateRange, customDateFrom, customDateTo]);

  // Fetch orders
  useEffect(() => {
    async function fetchOrders() {
      if (!currentRestaurant) return;
      setLoading(true);

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          status,
          total_amount,
          created_at,
          notes,
          table_id,
          order_items (
            id,
            quantity,
            unit_price,
            menu_item:menu_items (
              name,
              food_type
            )
          )
        `)
        .eq('restaurant_id', currentRestaurant.id)
        .gte('created_at', getDateRange.from.toISOString())
        .lte('created_at', getDateRange.to.toISOString())
        .order('created_at', { ascending: false });

      if (!error && data) {
        // Fetch table info separately
        const tableIds = data.filter(o => o.table_id).map(o => o.table_id);
        let tablesMap: Record<string, { table_number: string }> = {};
        
        if (tableIds.length > 0) {
          const { data: tables } = await supabase
            .from('tables')
            .select('id, table_number')
            .in('id', tableIds);
          
          if (tables) {
            tablesMap = tables.reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
          }
        }

        setOrders(data.map(order => ({
          ...order,
          status: order.status as OrderStatus,
          table: order.table_id ? tablesMap[order.table_id] : null,
          order_items: order.order_items.map(item => ({
            ...item,
            menu_item: item.menu_item as { name: string; food_type: string } | null
          }))
        })));
      }
      setLoading(false);
    }

    fetchOrders();
  }, [currentRestaurant, getDateRange]);

  // Calculate stats
  const stats = useMemo(() => {
    const completed = orders.filter(o => o.status === 'served');
    const cancelled = orders.filter(o => o.status === 'cancelled');
    const pending = orders.filter(o => ['pending', 'cooking', 'ready'].includes(o.status));
    
    const totalRevenue = completed.reduce((sum, o) => sum + Number(o.total_amount), 0);
    const avgOrderValue = completed.length > 0 ? totalRevenue / completed.length : 0;
    
    return {
      totalOrders: orders.length,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      pendingOrders: pending.length,
      totalRevenue,
      avgOrderValue,
    };
  }, [orders]);

  // Popular items
  const popularItems = useMemo(() => {
    const itemMap = new Map<string, MenuItem>();
    
    orders
      .filter(o => o.status === 'served')
      .forEach(order => {
        order.order_items.forEach(item => {
          const name = item.menu_item?.name || 'Unknown';
          const existing = itemMap.get(name) || { name, quantity: 0, revenue: 0 };
          itemMap.set(name, {
            name,
            quantity: existing.quantity + item.quantity,
            revenue: existing.revenue + (item.quantity * Number(item.unit_price))
          });
        });
      });

    return Array.from(itemMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [orders]);

  // Hourly data for today
  const hourlyData = useMemo(() => {
    if (dateRange !== 'today' && dateRange !== 'yesterday') return [];
    
    const baseDate = dateRange === 'yesterday' ? subDays(new Date(), 1) : new Date();
    const hours = eachHourOfInterval({
      start: startOfDay(baseDate),
      end: addHours(startOfDay(baseDate), 23)
    });

    return hours.map(hour => {
      const hourOrders = orders.filter(o => {
        const orderDate = parseISO(o.created_at);
        return orderDate.getHours() === hour.getHours() && o.status === 'served';
      });

      return {
        hour: format(hour, 'ha'),
        orders: hourOrders.length,
        revenue: hourOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
      };
    });
  }, [orders, dateRange]);

  // Daily data for week/month
  const dailyData = useMemo(() => {
    if (dateRange === 'today' || dateRange === 'yesterday') return [];

    const days = eachDayOfInterval({ start: getDateRange.from, end: getDateRange.to });

    return days.map(day => {
      const dayOrders = orders.filter(o => {
        const orderDate = parseISO(o.created_at);
        return isWithinInterval(orderDate, { start: startOfDay(day), end: endOfDay(day) }) && 
               o.status === 'served';
      });

      return {
        date: format(day, 'MMM d'),
        orders: dayOrders.length,
        revenue: dayOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
      };
    });
  }, [orders, dateRange, getDateRange]);

  // Order status distribution
  const statusDistribution = useMemo(() => {
    const distribution = {
      pending: 0,
      cooking: 0,
      ready: 0,
      served: 0,
      cancelled: 0,
    };

    orders.forEach(o => {
      distribution[o.status]++;
    });

    return Object.entries(distribution)
      .filter(([, value]) => value > 0)
      .map(([status, count]) => ({
        name: STATUS_CONFIG[status as OrderStatus].label,
        value: count,
      }));
  }, [orders]);

  // Filtered orders for history
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesSearch = !searchTerm || 
        order.order_items.some(item => 
          item.menu_item?.name.toLowerCase().includes(searchTerm.toLowerCase())
        ) ||
        order.table?.table_number.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, searchTerm]);

  // Pagination
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ordersPerPage;
    return filteredOrders.slice(start, start + ordersPerPage);
  }, [filteredOrders, currentPage]);

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);

  if (!currentRestaurant) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Please select a restaurant first.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Reports & Analytics</h1>
            <p className="text-muted-foreground mt-1">Track your restaurant performance</p>
          </div>
          
          {/* Date Range Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={dateRange} onValueChange={(value: DateRange) => setDateRange(value)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {dateRange === 'custom' && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[130px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customDateFrom ? format(customDateFrom, 'PP') : 'From'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDateFrom}
                      onSelect={setCustomDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[130px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customDateTo ? format(customDateTo, 'PP') : 'To'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDateTo}
                      onSelect={setCustomDateTo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>

        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <IndianRupee className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Revenue</p>
                      <p className="text-2xl font-bold text-foreground">₹{stats.totalRevenue.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Completed Orders</p>
                      <p className="text-2xl font-bold text-foreground">{stats.completedOrders}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                      <p className="text-2xl font-bold text-foreground">₹{stats.avgOrderValue.toFixed(0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Orders</p>
                      <p className="text-2xl font-bold text-foreground">{stats.pendingOrders}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Popular Items */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-primary" />
                  Top Selling Items
                </CardTitle>
                <CardDescription>Most popular dishes by quantity sold</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : popularItems.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No items sold in this period</p>
                ) : (
                  <div className="space-y-3">
                    {popularItems.map((item, index) => (
                      <div key={item.name} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                          index === 0 ? "bg-primary text-primary-foreground" :
                          index === 1 ? "bg-accent text-accent-foreground" :
                          "bg-muted-foreground/20 text-muted-foreground"
                        )}>
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{item.quantity} sold</p>
                        </div>
                        <p className="font-semibold text-foreground">₹{item.revenue.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Orders & Revenue Chart */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Orders & Revenue</CardTitle>
                  <CardDescription>
                    {dateRange === 'today' || dateRange === 'yesterday' ? 'Hourly breakdown' : 'Daily breakdown'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[300px] bg-muted animate-pulse rounded-lg" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={dateRange === 'today' || dateRange === 'yesterday' ? hourlyData : dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey={dateRange === 'today' || dateRange === 'yesterday' ? 'hour' : 'date'} 
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="orders" 
                          name="Orders"
                          stroke="hsl(18, 76%, 52%)" 
                          strokeWidth={2}
                          dot={{ fill: 'hsl(18, 76%, 52%)' }}
                        />
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="revenue" 
                          name="Revenue (₹)"
                          stroke="hsl(142, 76%, 36%)" 
                          strokeWidth={2}
                          dot={{ fill: 'hsl(142, 76%, 36%)' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Status Distribution */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Order Status Distribution</CardTitle>
                  <CardDescription>Breakdown by order status</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[300px] bg-muted animate-pulse rounded-lg" />
                  ) : statusDistribution.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No orders in this period
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {statusDistribution.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Top Items Bar Chart */}
              <Card className="glass-card lg:col-span-2">
                <CardHeader>
                  <CardTitle>Top Items Performance</CardTitle>
                  <CardDescription>Revenue and quantity comparison</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[300px] bg-muted animate-pulse rounded-lg" />
                  ) : popularItems.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No items sold in this period
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={popularItems} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12}
                          width={120}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Bar dataKey="quantity" name="Quantity" fill="hsl(18, 76%, 52%)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="revenue" name="Revenue (₹)" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Input
                  placeholder="Search orders by item or table..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cooking">Cooking</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="served">Served</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Orders List */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Order History
                </CardTitle>
                <CardDescription>
                  {filteredOrders.length} orders found
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : paginatedOrders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No orders found</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {paginatedOrders.map((order) => (
                        <div
                          key={order.id}
                          className="p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-foreground">
                                  Order #{order.id.slice(0, 8).toUpperCase()}
                                </span>
                                <Badge className={cn('status-badge', STATUS_CONFIG[order.status].className)}>
                                  {STATUS_CONFIG[order.status].label}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {format(parseISO(order.created_at), 'PPp')}
                                {order.table && ` • Table ${order.table.table_number}`}
                              </p>
                            </div>
                            <p className="text-lg font-bold text-primary">
                              ₹{Number(order.total_amount).toLocaleString()}
                            </p>
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            {order.order_items.slice(0, 3).map((item) => (
                              <Badge key={item.id} variant="secondary" className="text-xs">
                                <Utensils className="w-3 h-3 mr-1" />
                                {item.menu_item?.name || 'Unknown'} × {item.quantity}
                              </Badge>
                            ))}
                            {order.order_items.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{order.order_items.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
