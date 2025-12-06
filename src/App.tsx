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
              <Route path="/dashboard" element={<DashboardHome />} />
              <Route path="/dashboard/kitchens" element={<Kitchens />} />
              <Route path="/dashboard/floors" element={<Floors />} />
              <Route path="/dashboard/menu" element={<Menu />} />
              <Route path="/dashboard/orders" element={<Orders />} />
              <Route path="/dashboard/kitchen-view" element={<KitchenView />} />
              <Route path="/dashboard/order-kiosk" element={<OrderKiosk />} />
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
