import { useState, useEffect, useMemo, useCallback } from 'react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
  FileText,
  Download,
  FileSpreadsheet,
  Printer,
  Banknote,
  CreditCard,
  Smartphone,
  Pencil,
  Trash2
} from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, eachDayOfInterval, eachHourOfInterval, addHours } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type OrderStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';

interface Order {
  id: string;
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  notes: string | null;
  table_id: string | null;
  payment_method: string | null;
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
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>(undefined);
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('');
  const ordersPerPage = 10;

  // Delete order handler
  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    
    try {
      // First delete order items
      await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderToDelete.id);
      
      // Then delete the order
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderToDelete.id);
      
      if (error) throw error;
      
      setOrders(prev => prev.filter(o => o.id !== orderToDelete.id));
      toast({ title: 'Order deleted successfully' });
    } catch (error: any) {
      toast({ title: 'Failed to delete order', description: error.message, variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    }
  };

  // Edit order handler
  const handleEditOrder = async () => {
    if (!orderToEdit) return;
    
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          payment_method: editPaymentMethod || null,
          status: editStatus as OrderStatus,
        })
        .eq('id', orderToEdit.id);
      
      if (error) throw error;
      
      setOrders(prev => prev.map(o => 
        o.id === orderToEdit.id 
          ? { ...o, payment_method: editPaymentMethod || null, status: editStatus as OrderStatus }
          : o
      ));
      toast({ title: 'Order updated successfully' });
    } catch (error: any) {
      toast({ title: 'Failed to update order', description: error.message, variant: 'destructive' });
    } finally {
      setEditDialogOpen(false);
      setOrderToEdit(null);
    }
  };

  const openDeleteDialog = (order: Order) => {
    setOrderToDelete(order);
    setDeleteDialogOpen(true);
  };

  const openEditDialog = (order: Order) => {
    setOrderToEdit(order);
    setEditPaymentMethod(order.payment_method || '');
    setEditStatus(order.status);
    setEditDialogOpen(true);
  };

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
          payment_method,
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
    
    // Payment method breakdown
    const cashRevenue = completed
      .filter(o => o.payment_method === 'cash')
      .reduce((sum, o) => sum + Number(o.total_amount), 0);
    const onlineRevenue = completed
      .filter(o => o.payment_method === 'card' || o.payment_method === 'upi')
      .reduce((sum, o) => sum + Number(o.total_amount), 0);
    const unpaidRevenue = completed
      .filter(o => !o.payment_method)
      .reduce((sum, o) => sum + Number(o.total_amount), 0);
    
    return {
      totalOrders: orders.length,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      pendingOrders: pending.length,
      totalRevenue,
      avgOrderValue,
      cashRevenue,
      onlineRevenue,
      unpaidRevenue,
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
      const matchesPayment = paymentFilter === 'all' || 
        (paymentFilter === 'unpaid' && !order.payment_method) ||
        (paymentFilter === 'online' && (order.payment_method === 'card' || order.payment_method === 'upi')) ||
        order.payment_method === paymentFilter;
      const matchesSearch = !searchTerm || 
        order.order_items.some(item => 
          item.menu_item?.name.toLowerCase().includes(searchTerm.toLowerCase())
        ) ||
        order.table?.table_number.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesPayment && matchesSearch;
    });
  }, [orders, statusFilter, paymentFilter, searchTerm]);

  // Pagination
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ordersPerPage;
    return filteredOrders.slice(start, start + ordersPerPage);
  }, [filteredOrders, currentPage]);

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);

  // Export to CSV
  const exportToCSV = useCallback(() => {
    if (filteredOrders.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    setExporting(true);

    try {
      const headers = ['Order ID', 'Date & Time', 'Table', 'Items', 'Status', 'Total (₹)'];
      const rows = filteredOrders.map(order => [
        order.id.slice(0, 8).toUpperCase(),
        format(parseISO(order.created_at), 'yyyy-MM-dd HH:mm'),
        order.table?.table_number || 'N/A',
        order.order_items.map(i => `${i.menu_item?.name || 'Unknown'} x${i.quantity}`).join('; '),
        STATUS_CONFIG[order.status].label,
        Number(order.total_amount).toFixed(2)
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `orders_${format(getDateRange.from, 'yyyy-MM-dd')}_to_${format(getDateRange.to, 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "CSV exported successfully" });
    } catch (error) {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [filteredOrders, getDateRange, toast]);

  // Export to PDF
  const exportToPDF = useCallback(() => {
    if (!currentRestaurant) return;
    if (orders.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    setExporting(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(20);
      doc.setTextColor(40, 40, 40);
      doc.text(currentRestaurant.name, pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(14);
      doc.setTextColor(100, 100, 100);
      doc.text('Sales Report', pageWidth / 2, 28, { align: 'center' });

      doc.setFontSize(10);
      doc.text(
        `Period: ${format(getDateRange.from, 'PP')} - ${format(getDateRange.to, 'PP')}`,
        pageWidth / 2,
        35,
        { align: 'center' }
      );

      // Summary Section
      doc.setFontSize(12);
      doc.setTextColor(40, 40, 40);
      doc.text('Summary', 14, 48);

      const summaryData = [
        ['Total Orders', String(stats.totalOrders)],
        ['Completed Orders', String(stats.completedOrders)],
        ['Cancelled Orders', String(stats.cancelledOrders)],
        ['Total Revenue', `₹${stats.totalRevenue.toLocaleString()}`],
        ['Average Order Value', `₹${stats.avgOrderValue.toFixed(0)}`],
      ];

      autoTable(doc, {
        startY: 52,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'striped',
        headStyles: { fillColor: [200, 80, 50] },
        margin: { left: 14, right: 14 },
      });

      // Top Items Section
      const finalY1 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      doc.text('Top Selling Items', 14, finalY1 + 12);

      if (popularItems.length > 0) {
        autoTable(doc, {
          startY: finalY1 + 16,
          head: [['Item Name', 'Quantity Sold', 'Revenue (₹)']],
          body: popularItems.map(item => [
            item.name,
            String(item.quantity),
            item.revenue.toLocaleString()
          ]),
          theme: 'striped',
          headStyles: { fillColor: [200, 80, 50] },
          margin: { left: 14, right: 14 },
        });
      }

      // Orders Table
      const finalY2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      doc.addPage();
      doc.text('Order Details', 14, 20);

      const ordersTableData = filteredOrders.slice(0, 50).map(order => [
        order.id.slice(0, 8).toUpperCase(),
        format(parseISO(order.created_at), 'MM/dd HH:mm'),
        order.table?.table_number || '-',
        STATUS_CONFIG[order.status].label,
        `₹${Number(order.total_amount).toLocaleString()}`
      ]);

      autoTable(doc, {
        startY: 24,
        head: [['Order ID', 'Date', 'Table', 'Status', 'Total']],
        body: ordersTableData,
        theme: 'striped',
        headStyles: { fillColor: [200, 80, 50] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8 },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Generated on ${format(new Date(), 'PPp')} | Page ${i} of ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }

      doc.save(`report_${format(getDateRange.from, 'yyyy-MM-dd')}_to_${format(getDateRange.to, 'yyyy-MM-dd')}.pdf`);
      toast({ title: "PDF exported successfully" });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [currentRestaurant, orders, filteredOrders, stats, popularItems, getDateRange, toast]);

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
          
          {/* Date Range & Export */}
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting || loading}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-2" align="end">
                <div className="space-y-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start" 
                    onClick={exportToPDF}
                    disabled={exporting}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    PDF Report
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full justify-start" 
                    onClick={exportToCSV}
                    disabled={exporting}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    CSV Data
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

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

            {/* Payment Method Breakdown */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="w-5 h-5 text-primary" />
                  Revenue by Payment Type
                </CardTitle>
                <CardDescription>Breakdown of payments by method</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-success/10 border border-success/20">
                    <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                      <Banknote className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Cash</p>
                      <p className="text-xl font-bold text-foreground">₹{stats.cashRevenue.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Online (Card/UPI)</p>
                      <p className="text-xl font-bold text-foreground">₹{stats.onlineRevenue.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-muted border border-border">
                    <div className="w-10 h-10 rounded-lg bg-muted-foreground/20 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Not Recorded</p>
                      <p className="text-xl font-bold text-foreground">₹{stats.unpaidRevenue.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

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
              <Select value={paymentFilter} onValueChange={(value) => {
                setPaymentFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Payments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="online">Online (Card/UPI)</SelectItem>
                  <SelectItem value="card">Card Only</SelectItem>
                  <SelectItem value="upi">UPI Only</SelectItem>
                  <SelectItem value="unpaid">Not Recorded</SelectItem>
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
                                {order.payment_method && (
                                  <Badge variant="outline" className="text-xs">
                                    {order.payment_method === 'cash' ? <Banknote className="w-3 h-3 mr-1" /> : <Smartphone className="w-3 h-3 mr-1" />}
                                    {order.payment_method.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {format(parseISO(order.created_at), 'PPp')}
                                {order.table && ` • Table ${order.table.table_number}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="text-lg font-bold text-primary">
                                ₹{Number(order.total_amount).toLocaleString()}
                              </p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Print Receipt (Thermal)"
                                onClick={() => {
                                  const printWindow = window.open('', '_blank', 'width=300,height=600');
                                  if (!printWindow) {
                                    toast({ title: 'Please allow popups to print', variant: 'destructive' });
                                    return;
                                  }
                                  
                                  const itemsHtml = order.order_items.map(item => `
                                    <tr>
                                      <td style="text-align:left;padding:2px 0;">${item.menu_item?.name || 'Unknown'}</td>
                                      <td style="text-align:center;padding:2px 4px;">${item.quantity}</td>
                                      <td style="text-align:right;padding:2px 0;">₹${(item.quantity * Number(item.unit_price)).toLocaleString()}</td>
                                    </tr>
                                  `).join('');
                                  
                                  printWindow.document.write(`
                                    <!DOCTYPE html>
                                    <html>
                                    <head>
                                      <title>Receipt</title>
                                      <style>
                                        * { margin: 0; padding: 0; box-sizing: border-box; }
                                        body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 5mm; }
                                        .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                                        .header h1 { font-size: 16px; margin-bottom: 5px; }
                                        .info { margin-bottom: 10px; }
                                        .info p { margin: 2px 0; }
                                        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                                        .divider { border-top: 1px dashed #000; margin: 10px 0; }
                                        .total { font-weight: bold; font-size: 14px; text-align: right; }
                                        .footer { text-align: center; margin-top: 15px; font-size: 10px; }
                                        @media print { body { width: 80mm; } }
                                      </style>
                                    </head>
                                    <body>
                                      <div class="header">
                                        <h1>${currentRestaurant?.name || 'Restaurant'}</h1>
                                        ${currentRestaurant?.address ? `<p>${currentRestaurant.address}</p>` : ''}
                                        ${currentRestaurant?.phone ? `<p>Tel: ${currentRestaurant.phone}</p>` : ''}
                                      </div>
                                      <div class="info">
                                        <p><strong>Order #${order.id.slice(0, 8).toUpperCase()}</strong></p>
                                        <p>Date: ${format(parseISO(order.created_at), 'dd/MM/yyyy HH:mm')}</p>
                                        ${order.table ? `<p>Table: ${order.table.table_number}</p>` : ''}
                                      </div>
                                      <div class="divider"></div>
                                      <table>
                                        <thead>
                                          <tr>
                                            <th style="text-align:left;">Item</th>
                                            <th style="text-align:center;">Qty</th>
                                            <th style="text-align:right;">Amt</th>
                                          </tr>
                                        </thead>
                                        <tbody>${itemsHtml}</tbody>
                                      </table>
                                      <div class="divider"></div>
                                      <p class="total">TOTAL: ₹${Number(order.total_amount).toLocaleString()}</p>
                                      <div class="footer">
                                        <p>Thank you for dining with us!</p>
                                        ${currentRestaurant?.gstin ? `<p>GSTIN: ${currentRestaurant.gstin}</p>` : ''}
                                      </div>
                                    </body>
                                    </html>
                                  `);
                                  printWindow.document.close();
                                  printWindow.focus();
                                  setTimeout(() => {
                                    printWindow.print();
                                    printWindow.close();
                                  }, 250);
                                }}
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Edit Order"
                                onClick={() => openEditDialog(order)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                title="Delete Order"
                                onClick={() => openDeleteDialog(order)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
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

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Order?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete Order #{orderToDelete?.id.slice(0, 8).toUpperCase()}?
                This will permanently remove the order and all its items. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteOrder}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Order Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Order</DialogTitle>
              <DialogDescription>
                Update Order #{orderToEdit?.id.slice(0, 8).toUpperCase()}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={editPaymentMethod} onValueChange={setEditPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Order Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cooking">Cooking</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="served">Served</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditOrder}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
