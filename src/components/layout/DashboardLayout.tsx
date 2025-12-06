import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useActiveOrderCount } from '@/hooks/useActiveOrderCount';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  UtensilsCrossed,
  LayoutDashboard,
  ChefHat,
  Layers,
  BookOpen,
  ShoppingBag,
  LogOut,
  ChevronDown,
  Plus,
  Menu,
  X,
  Settings as SettingsIcon,
  Building2,
  Monitor,
  BarChart3,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Database } from '@/integrations/supabase/types';

type StaffRole = Database['public']['Enums']['staff_role'];

interface DashboardLayoutProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: StaffRole[]; // If undefined, visible to all
}

const getNavItems = (slug: string): NavItem[] => [
  { href: `/dashboard/${slug}`, label: 'Dashboard', icon: LayoutDashboard },
  { href: `/dashboard/${slug}/kitchens`, label: 'Kitchens', icon: ChefHat, roles: ['owner', 'manager'] },
  { href: `/dashboard/${slug}/floors`, label: 'Floors & Tables', icon: Layers, roles: ['owner', 'manager'] },
  { href: `/dashboard/${slug}/menu`, label: 'Menu', icon: BookOpen, roles: ['owner', 'manager'] },
  { href: `/dashboard/${slug}/orders`, label: 'Orders', icon: ShoppingBag },
  { href: `/dashboard/${slug}/kitchen-view`, label: 'Kitchen View', icon: ChefHat, roles: ['owner', 'manager', 'chef'] },
  { href: `/dashboard/${slug}/order-kiosk`, label: 'Order Kiosk', icon: Monitor, roles: ['owner', 'manager', 'waiter'] },
  { href: `/dashboard/${slug}/reports`, label: 'Reports', icon: BarChart3, roles: ['owner', 'manager'] },
  { href: `/dashboard/${slug}/staff`, label: 'Staff', icon: Users, roles: ['owner', 'manager'] },
  { href: `/dashboard/${slug}/settings`, label: 'Settings', icon: SettingsIcon, roles: ['owner'] },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, signOut } = useAuth();
  const { restaurants, staffRestaurants, currentRestaurant, currentRole, setCurrentRestaurant } = useRestaurant();
  const activeOrderCount = useActiveOrderCount(currentRestaurant?.id);
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync restaurant from URL slug
  useEffect(() => {
    if (slug && restaurants.length > 0) {
      const restaurant = restaurants.find(r => r.slug === slug);
      if (restaurant && restaurant.id !== currentRestaurant?.id) {
        setCurrentRestaurant(restaurant);
      }
    }
  }, [slug, restaurants, currentRestaurant, setCurrentRestaurant]);

  // Redirect to slug-based URL if on /dashboard without slug
  useEffect(() => {
    if (location.pathname === '/dashboard' && currentRestaurant?.slug) {
      navigate(`/dashboard/${currentRestaurant.slug}`, { replace: true });
    }
  }, [location.pathname, currentRestaurant, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleRestaurantChange = (restaurant: typeof currentRestaurant) => {
    if (restaurant) {
      setCurrentRestaurant(restaurant);
      // Navigate to the same page but with new restaurant slug
      const currentPath = location.pathname;
      const pathParts = currentPath.split('/');
      // Replace old slug with new slug
      if (pathParts.length >= 3 && pathParts[1] === 'dashboard') {
        if (pathParts[2] && restaurants.some(r => r.slug === pathParts[2])) {
          pathParts[2] = restaurant.slug;
          navigate(pathParts.join('/'));
        } else {
          navigate(`/dashboard/${restaurant.slug}`);
        }
      } else {
        navigate(`/dashboard/${restaurant.slug}`);
      }
    }
  };

  // Filter nav items based on role
  const allNavItems = currentRestaurant ? getNavItems(currentRestaurant.slug) : [];
  const navItems = allNavItems.filter(item => {
    if (!item.roles) return true; // Visible to all
    if (!currentRole) return false;
    return item.roles.includes(currentRole);
  });

  // Combine owned restaurants with staff restaurants for selector
  const allRestaurants = [
    ...restaurants.map(r => ({ ...r, role: 'owner' as StaffRole, isOwner: true })),
    ...staffRestaurants.filter(sr => !restaurants.find(r => r.id === sr.id)),
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gradient-sidebar border-r border-sidebar-border transform transition-transform duration-200 ease-in-out lg:transform-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-sidebar-foreground">RestroFlow</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto lg:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Restaurant Selector */}
          <div className="px-4 py-4 border-b border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {currentRestaurant?.name || 'Select Restaurant'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {allRestaurants.map((restaurant) => (
                  <DropdownMenuItem
                    key={restaurant.id}
                    onClick={() => handleRestaurantChange(restaurant)}
                    className={cn(
                      currentRestaurant?.id === restaurant.id && "bg-accent"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{restaurant.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs capitalize">
                        {restaurant.role}
                      </Badge>
                    </div>
                  </DropdownMenuItem>
                ))}
                {currentRole === 'owner' && <DropdownMenuSeparator />}
                {currentRole === 'owner' && (
                  <DropdownMenuItem onClick={() => navigate('/onboarding')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Restaurant
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.label === 'Dashboard' && location.pathname === `/dashboard/${currentRestaurant?.slug}`);
              const showBadge = item.label === 'Orders' && activeOrderCount > 0;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <Badge 
                      variant="destructive" 
                      className="h-5 min-w-5 px-1.5 text-xs font-semibold animate-pulse"
                    >
                      {activeOrderCount}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="p-4 border-t border-sidebar-border">
            <div className="mb-2 px-2">
              <Badge variant="outline" className="text-xs capitalize">
                {currentRole || 'No role'}
              </Badge>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-sm font-medium mr-2">
                    {user?.email?.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate text-sm">{user?.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {currentRole === 'owner' && (
                  <DropdownMenuItem onClick={() => navigate(`/dashboard/${currentRestaurant?.slug}/settings`)}>
                    <SettingsIcon className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                )}
                {currentRole === 'owner' && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-accent"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-primary" />
            <span className="font-semibold">RestroFlow</span>
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 lg:p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}