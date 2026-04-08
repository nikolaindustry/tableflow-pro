// Local API client - replaces Supabase for localhost/LAN mode
const API_BASE = window.location.origin + '/api';

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('tf_auth_token') || '';
  const userId = localStorage.getItem('tf_user_id') || '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-User-Id': userId,
  };
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API Error: ${res.status}`);
  }
  return res.json();
}

// Auth API
export const localAuth = {
  async signUp(email: string, password: string, fullName: string) {
    const data = await apiRequest<any>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
    localStorage.setItem('tf_auth_token', data.session.access_token);
    localStorage.setItem('tf_user_id', data.user.id);
    localStorage.setItem('tf_user_email', data.user.email);
    return { data, error: null };
  },

  async signIn(email: string, password: string) {
    try {
      const data = await apiRequest<any>('/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('tf_auth_token', data.session.access_token);
      localStorage.setItem('tf_user_id', data.user.id);
      localStorage.setItem('tf_user_email', data.user.email);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  },

  async getSession() {
    try {
      const data = await apiRequest<any>('/auth/session');
      return { data: { session: data.session }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },

  async signOut() {
    localStorage.removeItem('tf_auth_token');
    localStorage.removeItem('tf_user_id');
    localStorage.removeItem('tf_user_email');
    await apiRequest('/auth/signout', { method: 'POST' }).catch(() => {});
  },

  getUser() {
    const id = localStorage.getItem('tf_user_id');
    const email = localStorage.getItem('tf_user_email');
    if (!id) return null;
    return { id, email };
  },

  getUserId() {
    return localStorage.getItem('tf_user_id');
  }
};

// Data API - matches the patterns used in the frontend
export const localApi = {
  // Restaurants
  async getRestaurants() {
    return apiRequest<any[]>('/restaurants');
  },
  async getStaffRestaurants() {
    return apiRequest<any[]>('/restaurants/staff');
  },
  async createRestaurant(data: any) {
    return apiRequest<any>('/restaurants', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateRestaurant(id: string, data: any) {
    return apiRequest<any>(`/restaurants/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async linkStaff(email: string, userId: string) {
    return apiRequest<any>('/restaurants/link-staff', { method: 'POST', body: JSON.stringify({ email, user_id: userId }) });
  },

  // Orders (hot path - most critical for speed)
  async getOrders(restaurantId: string, status?: string) {
    const params = new URLSearchParams({ restaurant_id: restaurantId });
    if (status) params.append('status', status);
    return apiRequest<any[]>(`/orders?${params}`);
  },
  async createOrder(data: any) {
    return apiRequest<any>('/orders', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateOrder(id: string, data: any) {
    return apiRequest<any>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  async deleteOrder(id: string) {
    return apiRequest<any>(`/orders/${id}`, { method: 'DELETE' });
  },
  async updateOrderItem(id: string, data: any) {
    return apiRequest<any>(`/orders/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  async bulkUpdateOrderItems(orderId: string, fromStatus: string, toStatus: string) {
    return apiRequest<any>(`/orders/${orderId}/items-bulk`, { method: 'PATCH', body: JSON.stringify({ from_status: fromStatus, to_status: toStatus }) });
  },

  // Menu
  async getMenuCategories(restaurantId: string) {
    return apiRequest<any[]>(`/menu/categories?restaurant_id=${restaurantId}`);
  },
  async createMenuCategory(data: any) {
    return apiRequest<any>('/menu/categories', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateMenuCategory(id: string, data: any) {
    return apiRequest<any>(`/menu/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteMenuCategory(id: string) {
    return apiRequest<any>(`/menu/categories/${id}`, { method: 'DELETE' });
  },
  async getMenuItems(restaurantId: string, availableOnly = false) {
    const params = new URLSearchParams({ restaurant_id: restaurantId });
    if (availableOnly) params.append('available', 'true');
    return apiRequest<any[]>(`/menu/items?${params}`);
  },
  async createMenuItem(data: any) {
    return apiRequest<any>('/menu/items', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateMenuItem(id: string, data: any) {
    return apiRequest<any>(`/menu/items/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteMenuItem(id: string) {
    return apiRequest<any>(`/menu/items/${id}`, { method: 'DELETE' });
  },

  // Tables & Floors
  async getFloors(restaurantId: string) {
    return apiRequest<any[]>(`/tables/floors?restaurant_id=${restaurantId}`);
  },
  async getTables(restaurantId: string) {
    return apiRequest<any[]>(`/tables?restaurant_id=${restaurantId}`);
  },
  async createFloor(data: any) {
    return apiRequest<any>('/tables/floors', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateFloor(id: string, data: any) {
    return apiRequest<any>(`/tables/floors/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteFloor(id: string) {
    return apiRequest<any>(`/tables/floors/${id}`, { method: 'DELETE' });
  },
  async createTable(data: any) {
    return apiRequest<any>('/tables', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateTable(id: string, data: any) {
    return apiRequest<any>(`/tables/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteTable(id: string) {
    return apiRequest<any>(`/tables/${id}`, { method: 'DELETE' });
  },

  // Kitchens
  async getKitchens(restaurantId: string, activeOnly = false) {
    const params = new URLSearchParams({ restaurant_id: restaurantId });
    if (activeOnly) params.append('active', 'true');
    return apiRequest<any[]>(`/kitchens?${params}`);
  },
  async createKitchen(data: any) {
    return apiRequest<any>('/kitchens', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateKitchen(id: string, data: any) {
    return apiRequest<any>(`/kitchens/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteKitchen(id: string) {
    return apiRequest<any>(`/kitchens/${id}`, { method: 'DELETE' });
  },

  // Staff
  async getStaff(restaurantId: string) {
    return apiRequest<any[]>(`/staff?restaurant_id=${restaurantId}`);
  },
  async createStaff(data: any) {
    return apiRequest<any>('/staff', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateStaff(id: string, data: any) {
    return apiRequest<any>(`/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteStaff(id: string) {
    return apiRequest<any>(`/staff/${id}`, { method: 'DELETE' });
  },
  async getShifts(restaurantId: string) {
    return apiRequest<any[]>(`/staff/shifts?restaurant_id=${restaurantId}`);
  },
  async createShift(data: any) {
    return apiRequest<any>('/staff/shifts', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateShift(id: string, data: any) {
    return apiRequest<any>(`/staff/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteShift(id: string) {
    return apiRequest<any>(`/staff/shifts/${id}`, { method: 'DELETE' });
  },

  // Expenses
  async getExpenses(restaurantId: string) {
    return apiRequest<any[]>(`/expenses?restaurant_id=${restaurantId}`);
  },
  async createExpense(data: any) {
    return apiRequest<any>('/expenses', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateExpense(id: string, data: any) {
    return apiRequest<any>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteExpense(id: string) {
    return apiRequest<any>(`/expenses/${id}`, { method: 'DELETE' });
  },
  async getExpenseCategories(restaurantId: string) {
    return apiRequest<any[]>(`/expenses/categories?restaurant_id=${restaurantId}`);
  },
  async createExpenseCategory(data: any) {
    return apiRequest<any>('/expenses/categories', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateExpenseCategory(id: string, data: any) {
    return apiRequest<any>(`/expenses/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteExpenseCategory(id: string) {
    return apiRequest<any>(`/expenses/categories/${id}`, { method: 'DELETE' });
  },
  async getSuppliers(restaurantId: string) {
    return apiRequest<any[]>(`/expenses/suppliers?restaurant_id=${restaurantId}`);
  },
  async createSupplier(data: any) {
    return apiRequest<any>('/expenses/suppliers', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateSupplier(id: string, data: any) {
    return apiRequest<any>(`/expenses/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteSupplier(id: string) {
    return apiRequest<any>(`/expenses/suppliers/${id}`, { method: 'DELETE' });
  },

  // Printer
  async listPrinters() {
    return apiRequest<any>('/printer/list');
  },
  async connectPrinter(name: string) {
    return apiRequest<any>('/printer/connect', { method: 'POST', body: JSON.stringify({ name }) });
  },
  async disconnectPrinter() {
    return apiRequest<any>('/printer/disconnect', { method: 'POST' });
  },
  async getPrinterStatus() {
    return apiRequest<any>('/printer/status');
  },
  async printBill(billData: any) {
    return apiRequest<any>('/printer/print-bill', { method: 'POST', body: JSON.stringify(billData) });
  },
  async printKitchenTicket(orderData: any) {
    return apiRequest<any>('/printer/print-kitchen', { method: 'POST', body: JSON.stringify(orderData) });
  },

  // Sync
  async getSyncStatus() {
    return apiRequest<any>('/sync/status');
  },
  async startSync() {
    return apiRequest<any>('/sync/start', { method: 'POST' });
  },
};

// Check if running in local mode (Electron or localhost)
export function isLocalMode(): boolean {
  return !!(window as any).electronAPI ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    /^192\.168\./.test(window.location.hostname) ||
    /^10\./.test(window.location.hostname);
}
