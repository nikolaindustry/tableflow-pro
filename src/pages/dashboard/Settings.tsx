import { useState, useEffect } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Printer } from 'lucide-react';
import type { PrintOptions } from '@/services/thermalPrinter';

export default function Settings() {
  const { currentRestaurant, refreshRestaurants } = useRestaurant();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    gstin: '',
  });

  // Print settings state
  const [printOptions, setPrintOptions] = useState<PrintOptions>({
    showQRCode: true,
    showAddress: true,
    showPhone: true,
    showGSTIN: true,
    showThankYou: true,
    compactMode: false,
  });

  // Load print settings from localStorage
  useEffect(() => {
    const savedOptions = localStorage.getItem('thermal_print_options');
    if (savedOptions) {
      try {
        setPrintOptions(JSON.parse(savedOptions));
      } catch (e) {
        console.error('Failed to parse print options:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (currentRestaurant) {
      setForm({
        name: currentRestaurant.name || '',
        phone: currentRestaurant.phone || '',
        address: currentRestaurant.address || '',
        gstin: currentRestaurant.gstin || '',
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

  const handleSavePrintSettings = () => {
    localStorage.setItem('thermal_print_options', JSON.stringify(printOptions));
    toast({
      title: 'Saved',
      description: 'Print settings updated successfully',
    });
  };

  const togglePrintOption = (key: keyof PrintOptions) => {
    setPrintOptions(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Thermal Print Settings
            </CardTitle>
            <CardDescription>
              Customize thermal receipt printing to reduce paper usage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="compact-mode" className="text-base font-medium">
                    Ultra Compact Mode
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Minimal layout with ultra-tight spacing (saves ~50% paper)
                  </p>
                </div>
                <Switch
                  id="compact-mode"
                  checked={printOptions.compactMode}
                  onCheckedChange={() => togglePrintOption('compactMode')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-qr" className="text-base font-medium">
                    Show QR Code
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display QR code for order ID lookup
                  </p>
                </div>
                <Switch
                  id="show-qr"
                  checked={printOptions.showQRCode}
                  onCheckedChange={() => togglePrintOption('showQRCode')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-address" className="text-base font-medium">
                    Show Address
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display restaurant address on receipts
                  </p>
                </div>
                <Switch
                  id="show-address"
                  checked={printOptions.showAddress}
                  onCheckedChange={() => togglePrintOption('showAddress')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-phone" className="text-base font-medium">
                    Show Phone Number
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display restaurant phone on receipts
                  </p>
                </div>
                <Switch
                  id="show-phone"
                  checked={printOptions.showPhone}
                  onCheckedChange={() => togglePrintOption('showPhone')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-gstin" className="text-base font-medium">
                    Show GSTIN
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display GSTIN number on receipts
                  </p>
                </div>
                <Switch
                  id="show-gstin"
                  checked={printOptions.showGSTIN}
                  onCheckedChange={() => togglePrintOption('showGSTIN')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-thankyou" className="text-base font-medium">
                    Show Thank You Message
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Display thank you message at bottom
                  </p>
                </div>
                <Switch
                  id="show-thankyou"
                  checked={printOptions.showThankYou}
                  onCheckedChange={() => togglePrintOption('showThankYou')}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-medium text-sm">Paper Savings Estimate</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Normal mode: ~30% less paper than original</li>
                  <li>• Compact mode: ~50% less paper than original</li>
                  <li>• Hiding optional elements saves additional lines</li>
                </ul>
              </div>
            </div>

            <Button onClick={handleSavePrintSettings}>
              <Save className="w-4 h-4 mr-2" />
              Save Print Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
