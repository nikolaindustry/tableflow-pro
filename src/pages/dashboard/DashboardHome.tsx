import { useEffect, useState } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  ChefHat,
  Layers,
  BookOpen,
  ShoppingBag,
  TrendingUp,
  Clock,
  Users,
  ArrowRight,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';

interface Stats {
  kitchens: number;
  tables: number;
  menuItems: number;
  activeOrders: number;
}

export default function DashboardHome() {
  const { currentRestaurant } = useRestaurant();
  const [stats, setStats] = useState<Stats>({ kitchens: 0, tables: 0, menuItems: 0, activeOrders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentRestaurant) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const [kitchensRes, floorsRes, categoriesRes, ordersRes] = await Promise.all([
          supabase
            .from('kitchens')
            .select('id', { count: 'exact' })
            .eq('restaurant_id', currentRestaurant.id),
          supabase
            .from('floors')
            .select('id, tables(id)', { count: 'exact' })
            .eq('restaurant_id', currentRestaurant.id),
          supabase
            .from('menu_categories')
            .select('id, menu_items(id)', { count: 'exact' })
            .eq('restaurant_id', currentRestaurant.id),
          supabase
            .from('orders')
            .select('id', { count: 'exact' })
            .eq('restaurant_id', currentRestaurant.id)
            .in('status', ['pending', 'cooking']),
        ]);

        const tablesCount = floorsRes.data?.reduce(
          (acc, floor) => acc + (floor.tables?.length || 0),
          0
        ) || 0;

        const menuItemsCount = categoriesRes.data?.reduce(
          (acc, cat) => acc + (cat.menu_items?.length || 0),
          0
        ) || 0;

        setStats({
          kitchens: kitchensRes.count || 0,
          tables: tablesCount,
          menuItems: menuItemsCount,
          activeOrders: ordersRes.count || 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [currentRestaurant]);

  if (!currentRestaurant) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <ChefHat className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No Restaurant Selected</h2>
          <p className="text-muted-foreground mb-4">Create your first restaurant to get started</p>
          <Button asChild variant="gradient">
            <Link to="/onboarding">Create Restaurant</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const statCards = [
    {
      title: 'Kitchens',
      value: stats.kitchens,
      icon: ChefHat,
      href: '/dashboard/kitchens',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Tables',
      value: stats.tables,
      icon: Layers,
      href: '/dashboard/floors',
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Menu Items',
      value: stats.menuItems,
      icon: BookOpen,
      href: '/dashboard/menu',
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Active Orders',
      value: stats.activeOrders,
      icon: ShoppingBag,
      href: '/dashboard/orders',
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
  ];

  const quickActions = [
    {
      title: 'New Order',
      description: 'Create a new order for a table',
      href: '/dashboard/orders',
      icon: ShoppingBag,
    },
    {
      title: 'Kitchen View',
      description: 'View and manage kitchen orders',
      href: '/dashboard/kitchen-view',
      icon: ChefHat,
    },
    {
      title: 'Manage Menu',
      description: 'Add or edit menu items',
      href: '/dashboard/menu',
      icon: BookOpen,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
          Welcome back!
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening at {currentRestaurant.name} today
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Link key={stat.title} to={stat.href}>
            <Card className="hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`w-5 h-5 lg:w-6 lg:h-6 ${stat.color}`} />
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-4">
                  <p className="text-2xl lg:text-3xl font-bold">
                    {loading ? '—' : stat.value}
                  </p>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Link key={action.title} to={action.href}>
              <Card className="hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0 group-hover:shadow-glow transition-shadow">
                      <action.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium group-hover:text-primary transition-colors">
                        {action.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {action.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Setup Guide (if stats are low) */}
      {!loading && (stats.kitchens === 0 || stats.tables === 0 || stats.menuItems === 0) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Complete Your Setup
            </CardTitle>
            <CardDescription>
              Complete these steps to start taking orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.kitchens === 0 && (
                <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                      1
                    </div>
                    <span>Add your first kitchen</span>
                  </div>
                  <Button asChild size="sm">
                    <Link to="/dashboard/kitchens">Add Kitchen</Link>
                  </Button>
                </div>
              )}
              {stats.tables === 0 && (
                <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                      2
                    </div>
                    <span>Create floors and tables</span>
                  </div>
                  <Button asChild size="sm">
                    <Link to="/dashboard/floors">Add Floor</Link>
                  </Button>
                </div>
              )}
              {stats.menuItems === 0 && (
                <div className="flex items-center justify-between p-3 bg-card rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                      3
                    </div>
                    <span>Add menu categories and items</span>
                  </div>
                  <Button asChild size="sm">
                    <Link to="/dashboard/menu">Add Menu</Link>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
