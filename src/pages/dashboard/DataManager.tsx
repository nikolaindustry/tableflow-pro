import { useEffect, useState } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { toast } from 'sonner';
import {
  Database,
  Table2,
  Trash2,
  Pencil,
  RefreshCw,
  ChevronRight,
  Search,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TableName = 'floors' | 'tables' | 'kitchens' | 'menu_categories' | 'menu_items' | 'orders' | 'order_items' | 'staff_members' | 'shifts';

interface TableConfig {
  name: TableName;
  displayName: string;
  columns: { key: string; label: string; editable?: boolean }[];
  getQuery: (restaurantId: string) => Promise<{ data: any[] | null; error: any }>;
  deleteRow: (id: string) => Promise<{ error: any }>;
  updateRow: (id: string, data: Record<string, any>) => Promise<{ error: any }>;
}

const tableConfigs: TableConfig[] = [
  {
    name: 'floors',
    displayName: 'Floors',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', editable: true },
      { key: 'floor_number', label: 'Floor Number', editable: true },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => supabase.from('floors').select('*').eq('restaurant_id', restaurantId).order('floor_number'),
    deleteRow: async (id) => supabase.from('floors').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('floors').update(data).eq('id', id),
  },
  {
    name: 'tables',
    displayName: 'Tables',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'table_number', label: 'Table Number', editable: true },
      { key: 'capacity', label: 'Capacity', editable: true },
      { key: 'is_occupied', label: 'Occupied' },
      { key: 'floor_id', label: 'Floor ID' },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => {
      const { data: floors } = await supabase.from('floors').select('id').eq('restaurant_id', restaurantId);
      if (!floors?.length) return { data: [], error: null };
      return supabase.from('tables').select('*').in('floor_id', floors.map(f => f.id)).order('table_number');
    },
    deleteRow: async (id) => supabase.from('tables').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('tables').update(data).eq('id', id),
  },
  {
    name: 'kitchens',
    displayName: 'Kitchens',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', editable: true },
      { key: 'description', label: 'Description', editable: true },
      { key: 'is_active', label: 'Active' },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => supabase.from('kitchens').select('*').eq('restaurant_id', restaurantId).order('name'),
    deleteRow: async (id) => supabase.from('kitchens').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('kitchens').update(data).eq('id', id),
  },
  {
    name: 'menu_categories',
    displayName: 'Menu Categories',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', editable: true },
      { key: 'description', label: 'Description', editable: true },
      { key: 'sort_order', label: 'Sort Order', editable: true },
      { key: 'is_active', label: 'Active' },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => supabase.from('menu_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
    deleteRow: async (id) => supabase.from('menu_categories').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('menu_categories').update(data).eq('id', id),
  },
  {
    name: 'menu_items',
    displayName: 'Menu Items',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', editable: true },
      { key: 'description', label: 'Description', editable: true },
      { key: 'price', label: 'Price', editable: true },
      { key: 'food_type', label: 'Food Type', editable: true },
      { key: 'spice_level', label: 'Spice Level', editable: true },
      { key: 'is_available', label: 'Available' },
      { key: 'category_id', label: 'Category ID' },
    ],
    getQuery: async (restaurantId) => {
      const { data: categories } = await supabase.from('menu_categories').select('id').eq('restaurant_id', restaurantId);
      if (!categories?.length) return { data: [], error: null };
      return supabase.from('menu_items').select('*').in('category_id', categories.map(c => c.id)).order('name');
    },
    deleteRow: async (id) => supabase.from('menu_items').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('menu_items').update(data).eq('id', id),
  },
  {
    name: 'orders',
    displayName: 'Orders',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'status', label: 'Status', editable: true },
      { key: 'total_amount', label: 'Total Amount' },
      { key: 'table_id', label: 'Table ID' },
      { key: 'notes', label: 'Notes', editable: true },
      { key: 'created_at', label: 'Created At' },
      { key: 'updated_at', label: 'Updated At' },
    ],
    getQuery: async (restaurantId) => supabase.from('orders').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
    deleteRow: async (id) => supabase.from('orders').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('orders').update(data).eq('id', id),
  },
  {
    name: 'order_items',
    displayName: 'Order Items',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'order_id', label: 'Order ID' },
      { key: 'menu_item_id', label: 'Menu Item ID' },
      { key: 'quantity', label: 'Quantity', editable: true },
      { key: 'unit_price', label: 'Unit Price' },
      { key: 'status', label: 'Status', editable: true },
      { key: 'notes', label: 'Notes', editable: true },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => {
      const { data: orders } = await supabase.from('orders').select('id').eq('restaurant_id', restaurantId);
      if (!orders?.length) return { data: [], error: null };
      return supabase.from('order_items').select('*').in('order_id', orders.map(o => o.id)).order('created_at', { ascending: false });
    },
    deleteRow: async (id) => supabase.from('order_items').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('order_items').update(data).eq('id', id),
  },
  {
    name: 'staff_members',
    displayName: 'Staff Members',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'full_name', label: 'Full Name', editable: true },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone', editable: true },
      { key: 'role', label: 'Role', editable: true },
      { key: 'is_active', label: 'Active' },
      { key: 'joined_at', label: 'Joined At' },
    ],
    getQuery: async (restaurantId) => supabase.from('staff_members').select('*').eq('restaurant_id', restaurantId).order('role'),
    deleteRow: async (id) => supabase.from('staff_members').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('staff_members').update(data).eq('id', id),
  },
  {
    name: 'shifts',
    displayName: 'Shifts',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'staff_member_id', label: 'Staff Member ID' },
      { key: 'shift_date', label: 'Shift Date', editable: true },
      { key: 'start_time', label: 'Start Time', editable: true },
      { key: 'end_time', label: 'End Time', editable: true },
      { key: 'notes', label: 'Notes', editable: true },
    ],
    getQuery: async (restaurantId) => supabase.from('shifts').select('*').eq('restaurant_id', restaurantId).order('shift_date', { ascending: false }),
    deleteRow: async (id) => supabase.from('shifts').delete().eq('id', id),
    updateRow: async (id, data) => supabase.from('shifts').update(data).eq('id', id),
  },
];

export default function DataManager() {
  const { currentRestaurant } = useRestaurant();
  const [selectedTable, setSelectedTable] = useState<TableConfig>(tableConfigs[0]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRow, setEditingRow] = useState<any>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    if (!currentRestaurant) return;
    
    setLoading(true);
    try {
      const { data: result, error } = await selectedTable.getQuery(currentRestaurant.id);
      if (error) throw error;
      setData(result || []);
    } catch (error: any) {
      toast.error(`Failed to load ${selectedTable.displayName}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedTable, currentRestaurant]);

  const handleEdit = (row: any) => {
    setEditingRow(row);
    const formData: Record<string, any> = {};
    selectedTable.columns.forEach(col => {
      if (col.editable) {
        formData[col.key] = row[col.key];
      }
    });
    setEditFormData(formData);
  };

  const handleSave = async () => {
    if (!editingRow) return;
    
    setSaving(true);
    try {
      const { error } = await selectedTable.updateRow(editingRow.id, editFormData);
      if (error) throw error;
      toast.success('Row updated successfully');
      setEditingRow(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update row');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const { error } = await selectedTable.deleteRow(id);
      if (error) throw error;
      toast.success('Row deleted successfully');
      setDeleteConfirm(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete row');
    } finally {
      setDeleting(false);
    }
  };

  const filteredData = data.filter(row => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return Object.values(row).some(value => 
      String(value).toLowerCase().includes(query)
    );
  });

  const formatCellValue = (value: any, key: string) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground">NULL</span>;
    if (typeof value === 'boolean') {
      return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'true' : 'false'}</Badge>;
    }
    if (key === 'created_at' || key === 'updated_at' || key === 'joined_at' || key === 'invited_at') {
      return new Date(value).toLocaleString();
    }
    if (key === 'price' || key === 'total_amount' || key === 'unit_price') {
      return `₹${Number(value).toFixed(2)}`;
    }
    if (key === 'id' || key.endsWith('_id')) {
      return <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{String(value).slice(0, 8)}...</code>;
    }
    if (key === 'status' || key === 'role' || key === 'food_type' || key === 'spice_level') {
      return <Badge variant="outline">{String(value)}</Badge>;
    }
    return String(value);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
        {/* Table Sidebar */}
        <Card className="lg:w-64 shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="w-4 h-4" />
              Tables
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-14rem)]">
              <div className="space-y-1 p-2">
                {tableConfigs.map((table) => (
                  <button
                    key={table.name}
                    onClick={() => setSelectedTable(table)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      selectedTable.name === table.name
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Table2 className="w-4 h-4" />
                    <span className="flex-1 text-left">{table.displayName}</span>
                    <ChevronRight className={cn(
                      "w-4 h-4 transition-transform",
                      selectedTable.name === table.name && "rotate-90"
                    )} />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Data View */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{selectedTable.displayName}</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter rows..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-48"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
                  <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {filteredData.length} row{filteredData.length !== 1 ? 's' : ''} 
              {searchQuery && ` (filtered from ${data.length})`}
            </p>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Table2 className="w-8 h-8 mb-2" />
                  <p>No data found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-20">Actions</TableHead>
                      {selectedTable.columns.map((col) => (
                        <TableHead key={col.key} className="whitespace-nowrap">
                          {col.label}
                          {col.editable && <span className="ml-1 text-xs text-muted-foreground">(editable)</span>}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(row)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirm(row.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        {selectedTable.columns.map((col) => (
                          <TableCell key={col.key} className="font-mono text-xs">
                            {formatCellValue(row[col.key], col.key)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingRow} onOpenChange={() => setEditingRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Row</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedTable.columns.filter(col => col.editable).map((col) => (
              <div key={col.key} className="grid gap-2">
                <label className="text-sm font-medium">{col.label}</label>
                <Input
                  value={editFormData[col.key] ?? ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, [col.key]: e.target.value }))}
                  placeholder={`Enter ${col.label.toLowerCase()}`}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRow(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Row?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the row from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
