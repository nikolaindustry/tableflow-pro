import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { RestaurantProvider } from "@/contexts/RestaurantContext";
import Index from "./pages/Index";
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
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/onboarding" element={<Onboarding />} />
              
              {/* Dashboard routes with restaurant slug */}
              <Route path="/dashboard" element={<DashboardHome />} />
              <Route path="/dashboard/:slug" element={<DashboardHome />} />
              <Route path="/dashboard/:slug/kitchens" element={<Kitchens />} />
              <Route path="/dashboard/:slug/floors" element={<Floors />} />
              <Route path="/dashboard/:slug/menu" element={<Menu />} />
              <Route path="/dashboard/:slug/orders" element={<Orders />} />
              <Route path="/dashboard/:slug/kitchen-view" element={<KitchenView />} />
              <Route path="/dashboard/:slug/order-kiosk" element={<OrderKiosk />} />
              <Route path="/dashboard/:slug/reports" element={<Reports />} />
              <Route path="/dashboard/:slug/staff" element={<Staff />} />
              <Route path="/dashboard/:slug/settings" element={<Settings />} />
              
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