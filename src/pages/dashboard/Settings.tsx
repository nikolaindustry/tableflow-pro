import { useState, useEffect } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';

export default function Settings() {
  const { currentRestaurant, refreshRestaurants } = useRestaurant();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    gstin: '',
    cgst_percentage: '',
    sgst_percentage: '',
  });

  useEffect(() => {
    if (currentRestaurant) {
      setForm({
        name: currentRestaurant.name || '',
        phone: currentRestaurant.phone || '',
        address: currentRestaurant.address || '',
        gstin: currentRestaurant.gstin || '',
        cgst_percentage: currentRestaurant.cgst_percentage?.toString() || '',
        sgst_percentage: currentRestaurant.sgst_percentage?.toString() || '',
      });
    }
  }, [currentRestaurant]);

  const handleSave = async () => {
    if (!currentRestaurant) return;

    setSaving(true);
    const { error } = await supabase
      .from('restaurants')
      .update({
        name: form.name,
        phone: form.phone,
        address: form.address,
        gstin: form.gstin,
        cgst_percentage: form.cgst_percentage ? parseFloat(form.cgst_percentage) : 0,
        sgst_percentage: form.sgst_percentage ? parseFloat(form.sgst_percentage) : 0,
      })
      .eq('id', currentRestaurant.id);

    setSaving(false);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Saved',
        description: 'Restaurant settings updated successfully',
      });
      refreshRestaurants();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your restaurant settings</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Restaurant Details</CardTitle>
            <CardDescription>Update your restaurant information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Restaurant Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter restaurant name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Enter full address"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                placeholder="Enter GSTIN number"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cgst">CGST (%)</Label>
                <Input
                  id="cgst"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.cgst_percentage}
                  onChange={(e) => setForm({ ...form, cgst_percentage: e.target.value })}
                  placeholder="e.g., 9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sgst">SGST (%)</Label>
                <Input
                  id="sgst"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.sgst_percentage}
                  onChange={(e) => setForm({ ...form, sgst_percentage: e.target.value })}
                  placeholder="e.g., 9"
                />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
