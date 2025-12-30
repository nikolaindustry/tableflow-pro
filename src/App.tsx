import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RestaurantProvider } from "@/contexts/RestaurantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import DashboardHome from "./pages/dashboard/DashboardHome";
import Kitchens from "./pages/dashboard/Kitchens";
import Floors from "./pages/dashboard/Floors";
import Menu from "./pages/dashboard/Menu";
import Orders from "./pages/dashboard/Orders";
import KitchenView from "./pages/dashboard/KitchenView";
import OrderKiosk from "./pages/dashboard/OrderKiosk";
import Settings from "./pages/dashboard/Settings";
import Reports from "./pages/dashboard/Reports";
import Staff from "./pages/dashboard/Staff";
import DataManager from "./pages/dashboard/DataManager";
import Expenses from "./pages/dashboard/Expenses";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <RestaurantProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              
              {/* Dashboard routes with restaurant slug */}
              <Route path="/dashboard" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
              <Route path="/dashboard/:slug" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/kitchens" element={<ProtectedRoute><Kitchens /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/floors" element={<ProtectedRoute><Floors /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/menu" element={<ProtectedRoute><Menu /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/kitchen-view" element={<ProtectedRoute><KitchenView /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/order-kiosk" element={<ProtectedRoute><OrderKiosk /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/staff" element={<ProtectedRoute><Staff /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/dashboard/:slug/data" element={<ProtectedRoute><DataManager /></ProtectedRoute>} />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </RestaurantProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;