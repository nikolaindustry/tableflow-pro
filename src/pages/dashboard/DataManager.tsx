import { useEffect, useState } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { localApi } from '@/services/localApi';
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
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TableName = 'floors' | 'tables' | 'kitchens' | 'menu_categories' | 'menu_items' | 'orders' | 'order_items' | 'staff_members' | 'shifts';

interface ColumnConfig {
  key: string;
  label: string;
  editable?: boolean;
  insertable?: boolean;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  required?: boolean;
}

interface TableConfig {
  name: TableName;
  displayName: string;
  columns: ColumnConfig[];
  getQuery: (restaurantId: string) => Promise<{ data: any[] | null; error: any }>;
  deleteRow: (id: string) => Promise<{ error: any }>;
  updateRow: (id: string, data: Record<string, any>) => Promise<{ error: any }>;
  insertRow: (restaurantId: string, data: Record<string, any>) => Promise<{ error: any }>;
}

// Helper for generic CRUD via localApi
const genericApi = {
  async query(endpoint: string): Promise<{ data: any[] | null; error: any }> {
    try {
      const data = await (localApi as any)[endpoint];
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },
};

const tableConfigs: TableConfig[] = [
  {
    name: 'floors',
    displayName: 'Floors',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', editable: true, insertable: true, required: true },
      { key: 'floor_number', label: 'Floor Number', editable: true, insertable: true, type: 'number', required: true },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => {
      try { return { data: await localApi.getFloors(restaurantId), error: null }; } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.deleteFloor(id); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateFloor(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (restaurantId, data) => {
      try { await localApi.createFloor({ ...data, restaurant_id: restaurantId }); return { error: null }; } catch (e) { return { error: e }; }
    },
  },
  {
    name: 'tables',
    displayName: 'Tables',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'table_number', label: 'Table Number', editable: true, insertable: true, required: true },
      { key: 'capacity', label: 'Capacity', editable: true, insertable: true, type: 'number', required: true },
      { key: 'is_occupied', label: 'Occupied' },
      { key: 'floor_id', label: 'Floor ID', insertable: true, required: true },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => {
      try { return { data: await localApi.getTables(restaurantId), error: null }; } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.deleteTable(id); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateTable(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (_restaurantId, data) => {
      try { await localApi.createTable(data); return { error: null }; } catch (e) { return { error: e }; }
    },
  },
  {
    name: 'kitchens',
    displayName: 'Kitchens',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', editable: true, insertable: true, required: true },
      { key: 'description', label: 'Description', editable: true, insertable: true },
      { key: 'is_active', label: 'Active' },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => {
      try { return { data: await localApi.getKitchens(restaurantId), error: null }; } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.deleteKitchen(id); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateKitchen(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (restaurantId, data) => {
      try { await localApi.createKitchen({ ...data, restaurant_id: restaurantId }); return { error: null }; } catch (e) { return { error: e }; }
    },
  },
  {
    name: 'menu_categories',
    displayName: 'Menu Categories',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', editable: true, insertable: true, required: true },
      { key: 'description', label: 'Description', editable: true, insertable: true },
      { key: 'sort_order', label: 'Sort Order', editable: true, insertable: true, type: 'number' },
      { key: 'is_active', label: 'Active' },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => {
      try { return { data: await localApi.getMenuCategories(restaurantId), error: null }; } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.deleteMenuCategory(id); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateMenuCategory(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (restaurantId, data) => {
      try { await localApi.createMenuCategory({ ...data, restaurant_id: restaurantId }); return { error: null }; } catch (e) { return { error: e }; }
    },
  },
  {
    name: 'menu_items',
    displayName: 'Menu Items',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', editable: true, insertable: true, required: true },
      { key: 'description', label: 'Description', editable: true, insertable: true },
      { key: 'price', label: 'Price', editable: true, insertable: true, type: 'number', required: true },
      { key: 'food_type', label: 'Food Type', editable: true, insertable: true, type: 'select', options: ['veg', 'non_veg', 'egg'] },
      { key: 'spice_level', label: 'Spice Level', editable: true, insertable: true, type: 'select', options: ['mild', 'medium', 'spicy', 'extra_spicy'] },
      { key: 'is_available', label: 'Available' },
      { key: 'category_id', label: 'Category ID', insertable: true, required: true },
    ],
    getQuery: async (restaurantId) => {
      try { return { data: await localApi.getMenuItems(restaurantId), error: null }; } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.deleteMenuItem(id); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateMenuItem(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (_restaurantId, data) => {
      try { await localApi.createMenuItem(data); return { error: null }; } catch (e) { return { error: e }; }
    },
  },
  {
    name: 'orders',
    displayName: 'Orders',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'status', label: 'Status', editable: true, insertable: true, type: 'select', options: ['pending', 'cooking', 'ready', 'served', 'cancelled'] },
      { key: 'total_amount', label: 'Total Amount', insertable: true, type: 'number' },
      { key: 'table_id', label: 'Table ID', insertable: true },
      { key: 'notes', label: 'Notes', editable: true, insertable: true },
      { key: 'created_at', label: 'Created At' },
      { key: 'updated_at', label: 'Updated At' },
    ],
    getQuery: async (restaurantId) => {
      try { return { data: await localApi.getOrders(restaurantId), error: null }; } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.deleteOrder(id); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateOrder(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (restaurantId, data) => {
      try { await localApi.createOrder({ ...data, restaurant_id: restaurantId }); return { error: null }; } catch (e) { return { error: e }; }
    },
  },
  {
    name: 'order_items',
    displayName: 'Order Items',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'order_id', label: 'Order ID', insertable: true, required: true },
      { key: 'menu_item_id', label: 'Menu Item ID', insertable: true, required: true },
      { key: 'quantity', label: 'Quantity', editable: true, insertable: true, type: 'number', required: true },
      { key: 'unit_price', label: 'Unit Price', insertable: true, type: 'number', required: true },
      { key: 'status', label: 'Status', editable: true, insertable: true, type: 'select', options: ['pending', 'cooking', 'ready', 'served', 'cancelled'] },
      { key: 'notes', label: 'Notes', editable: true, insertable: true },
      { key: 'created_at', label: 'Created At' },
    ],
    getQuery: async (restaurantId) => {
      try {
        // Get all orders first, then get their items
        const orders = await localApi.getOrders(restaurantId);
        const allItems = orders?.flatMap((o: any) => o.order_items || []) || [];
        return { data: allItems, error: null };
      } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.updateOrderItem(id, { status: 'cancelled' }); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateOrderItem(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (_restaurantId, _data) => {
      return { error: new Error('Use order creation to add items') };
    },
  },
  {
    name: 'staff_members',
    displayName: 'Staff Members',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'full_name', label: 'Full Name', editable: true, insertable: true, required: true },
      { key: 'email', label: 'Email', insertable: true, required: true },
      { key: 'phone', label: 'Phone', editable: true, insertable: true },
      { key: 'role', label: 'Role', editable: true, insertable: true, type: 'select', options: ['owner', 'manager', 'waiter', 'chef'], required: true },
      { key: 'is_active', label: 'Active' },
      { key: 'joined_at', label: 'Joined At' },
    ],
    getQuery: async (restaurantId) => {
      try { return { data: await localApi.getStaff(restaurantId), error: null }; } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.deleteStaff(id); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateStaff(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (restaurantId, data) => {
      try { await localApi.createStaff({ ...data, restaurant_id: restaurantId }); return { error: null }; } catch (e) { return { error: e }; }
    },
  },
  {
    name: 'shifts',
    displayName: 'Shifts',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'staff_member_id', label: 'Staff Member ID', insertable: true, required: true },
      { key: 'shift_date', label: 'Shift Date', editable: true, insertable: true, required: true },
      { key: 'start_time', label: 'Start Time', editable: true, insertable: true, required: true },
      { key: 'end_time', label: 'End Time', editable: true, insertable: true, required: true },
      { key: 'notes', label: 'Notes', editable: true, insertable: true },
    ],
    getQuery: async (restaurantId) => {
      try { return { data: await localApi.getShifts(restaurantId), error: null }; } catch (e) { return { data: [], error: e }; }
    },
    deleteRow: async (id) => {
      try { await localApi.deleteShift(id); return { error: null }; } catch (e) { return { error: e }; }
    },
    updateRow: async (id, data) => {
      try { await localApi.updateShift(id, data); return { error: null }; } catch (e) { return { error: e }; }
    },
    insertRow: async (restaurantId, data) => {
      try { await localApi.createShift({ ...data, restaurant_id: restaurantId }); return { error: null }; } catch (e) { return { error: e }; }
    },
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
  const [showInsertDialog, setShowInsertDialog] = useState(false);
  const [insertFormData, setInsertFormData] = useState<Record<string, any>>({});
  const [inserting, setInserting] = useState(false);

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

  const handleOpenInsert = () => {
    const formData: Record<string, any> = {};
    selectedTable.columns.forEach(col => {
      if (col.insertable) {
        formData[col.key] = '';
      }
    });
    setInsertFormData(formData);
    setShowInsertDialog(true);
  };

  const handleInsert = async () => {
    if (!currentRestaurant) return;
    
    // Validate required fields
    const missingFields = selectedTable.columns
      .filter(col => col.insertable && col.required && !insertFormData[col.key]?.toString().trim())
      .map(col => col.label);
    
    if (missingFields.length > 0) {
      toast.error(`Please fill in: ${missingFields.join(', ')}`);
      return;
    }
    
    setInserting(true);
    try {
      // Convert number fields
      const processedData = { ...insertFormData };
      selectedTable.columns.forEach(col => {
        if (col.type === 'number' && processedData[col.key]) {
          processedData[col.key] = Number(processedData[col.key]);
        }
      });
      
      const { error } = await selectedTable.insertRow(currentRestaurant.id, processedData);
      if (error) throw error;
      toast.success('Row inserted successfully');
      setShowInsertDialog(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to insert row');
    } finally {
      setInserting(false);
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
                <Button onClick={handleOpenInsert} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Row
                </Button>
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

      {/* Insert Dialog */}
      <Dialog open={showInsertDialog} onOpenChange={setShowInsertDialog}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Row to {selectedTable.displayName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedTable.columns.filter(col => col.insertable).map((col) => (
              <div key={col.key} className="grid gap-2">
                <label className="text-sm font-medium">
                  {col.label}
                  {col.required && <span className="text-destructive ml-1">*</span>}
                </label>
                {col.type === 'select' && col.options ? (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={insertFormData[col.key] ?? ''}
                    onChange={(e) => setInsertFormData(prev => ({ ...prev, [col.key]: e.target.value }))}
                  >
                    <option value="">Select {col.label.toLowerCase()}</option>
                    {col.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={col.type === 'number' ? 'number' : 'text'}
                    value={insertFormData[col.key] ?? ''}
                    onChange={(e) => setInsertFormData(prev => ({ ...prev, [col.key]: e.target.value }))}
                    placeholder={`Enter ${col.label.toLowerCase()}`}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInsertDialog(false)}>Cancel</Button>
            <Button onClick={handleInsert} disabled={inserting}>
              {inserting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Insert Row
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
