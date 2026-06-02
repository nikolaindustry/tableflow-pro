import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Receipt, 
  Banknote, 
  CreditCard, 
  Smartphone, 
  Printer, 
  Bluetooth, 
  User, 
  ChevronUp, 
  ChevronDown 
} from 'lucide-react';
import { Usb } from 'lucide-react';
import { useThermalPrinter } from '@/hooks/useThermalPrinter';
import { useUSBPrinter } from '@/hooks/useUSBPrinter';
import { PrinterSelector } from '@/components/PrinterSelector';
import { toast } from 'sonner';
import type { BillData } from '@/services/thermalPrinter';

interface OrderItem {
  id: string;
  menu_item?: { name: string };
  quantity: number;
  unit_price: number;
}

interface BillingOrder {
  id: string;
  table_id: string | null;
  total_amount: number;
  table?: { table_number: string; floor: { name: string } };
  order_items: OrderItem[];
}

interface BillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: BillingOrder | null;
  onPaymentComplete: (paymentMethod: 'cash' | 'card' | 'upi') => Promise<void>;
  restaurantName?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  restaurantGstin?: string;
  restaurantCgstPercentage?: number;
  restaurantSgstPercentage?: number;
}

export function BillingDialog({
  open,
  onOpenChange,
  order,
  onPaymentComplete,
  restaurantName,
  restaurantAddress,
  restaurantPhone,
  restaurantGstin,
  restaurantCgstPercentage = 0,
  restaurantSgstPercentage = 0,
}: BillingDialogProps) {
  const [processingPayment, setProcessingPayment] = useState(false);
  const [printerSelectorOpen, setPrinterSelectorOpen] = useState(false);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');

  const { printBill: printThermal, connectedDevice, isBluetoothAvailable, printing } = useThermalPrinter();
  const { connectedPrinter: usbPrinter, printing: usbPrinting, isAvailable: isUSBAvailable, connectPrinter: connectUSB, printBill: printUSB } = useUSBPrinter();

  const getBillData = (): BillData | null => {
    if (!order) return null;
    
    // Calculate GST amounts
    const cgstAmount = (order.total_amount * restaurantCgstPercentage) / 100;
    const sgstAmount = (order.total_amount * restaurantSgstPercentage) / 100;
    const grandTotal = order.total_amount + cgstAmount + sgstAmount;
    
    return {
      restaurantName: restaurantName || '',
      restaurantAddress: restaurantAddress,
      restaurantPhone: restaurantPhone,
      restaurantGstin: restaurantGstin,
      tableNumber: order.table?.table_number,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerGstin: customerGstin.trim() || undefined,
      items: order.order_items.map(item => ({
        name: item.menu_item?.name || 'Item',
        quantity: item.quantity,
        price: item.unit_price,
      })),
      subtotal: order.total_amount,
      cgstPercentage: restaurantCgstPercentage,
      sgstPercentage: restaurantSgstPercentage,
      cgstAmount,
      sgstAmount,
      total: grandTotal,
    };
  };

  const handlePrintBill = async (method: 'usb' | 'bluetooth' | 'browser' = 'usb') => {
    const billData = getBillData();
    if (!billData) return;
    
    try {
      if (method === 'usb' && usbPrinter) {
        await printUSB(billData);
        toast.success('Receipt printed');
      } else if (method === 'bluetooth' && connectedDevice) {
        await printThermal(billData, true);
        toast.success('Receipt printed via Bluetooth');
      } else {
        await printThermal(billData, false);
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleConnectUSB = async () => {
    try {
      await connectUSB();
      toast.success('USB printer connected!');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handlePayment = async (paymentMethod: 'cash' | 'card' | 'upi') => {
    setProcessingPayment(true);
    try {
      await onPaymentComplete(paymentMethod);
      // Reset customer details
      setShowCustomerDetails(false);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to process payment');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setShowCustomerDetails(false);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerGstin('');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Bill & Payment
            </DialogTitle>
            <DialogDescription>
              {order?.table 
                ? `${order.table.table_number} - ${order.table.floor.name}`
                : 'Takeaway Order'}
            </DialogDescription>
          </DialogHeader>
          
          {order && (
            <div className="space-y-4">
              {/* Order Summary */}
              <div className="border rounded-lg p-4 space-y-2">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.menu_item?.name || 'Item'} ×{item.quantity}
                    </span>
                    <span>₹{(item.unit_price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>₹{order.total_amount.toFixed(2)}</span>
                  </div>
                  {(restaurantCgstPercentage > 0 || restaurantSgstPercentage > 0) && (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>CGST ({restaurantCgstPercentage}%)</span>
                        <span>₹{((order.total_amount * restaurantCgstPercentage) / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>SGST ({restaurantSgstPercentage}%)</span>
                        <span>₹{((order.total_amount * restaurantSgstPercentage) / 100).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Grand Total</span>
                    <span>₹{(order.total_amount + ((order.total_amount * restaurantCgstPercentage) / 100) + ((order.total_amount * restaurantSgstPercentage) / 100)).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Customer Details (Optional) */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setShowCustomerDetails(!showCustomerDetails)}
                >
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Add Customer Details (Optional)
                  </span>
                  {showCustomerDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showCustomerDetails && (
                  <div className="p-3 pt-0 space-y-2">
                    <Input
                      placeholder="Customer Name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                    <Input
                      placeholder="Phone Number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                    <Input
                      placeholder="Customer GSTIN"
                      value={customerGstin}
                      onChange={(e) => setCustomerGstin(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Print Options */}
              <div className="flex gap-2">
                {/* USB Thermal Print - Primary */}
                {isUSBAvailable && (
                  <Button 
                    variant={usbPrinter ? 'default' : 'outline'}
                    className={`flex-1 ${usbPrinter ? 'bg-primary' : ''}`}
                    onClick={() => usbPrinter ? handlePrintBill('usb') : handleConnectUSB()}
                    disabled={usbPrinting}
                  >
                    <Usb className="w-4 h-4 mr-2" />
                    {usbPrinter ? `Print (${usbPrinter.name.substring(0, 12)})` : 'Connect USB Printer'}
                  </Button>
                )}
                {/* Browser Print - Fallback */}
                <Button variant="outline" className={isUSBAvailable ? '' : 'flex-1'} onClick={() => handlePrintBill('browser')} disabled={printing}>
                  <Printer className="w-4 h-4 mr-2" />
                  Browser
                </Button>
                {/* Bluetooth - Mobile only */}
                {isBluetoothAvailable && (
                  <Button 
                    variant="outline" 
                    className={connectedDevice ? 'border-success text-success' : ''}
                    onClick={() => connectedDevice ? handlePrintBill('bluetooth') : setPrinterSelectorOpen(true)}
                    disabled={printing}
                  >
                    <Bluetooth className="w-4 h-4 mr-2" />
                    BT
                  </Button>
                )}
              </div>

              {/* Payment Methods */}
              <div className="space-y-2">
                <Label>Select Payment Method</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    className="flex flex-col items-center gap-1 h-auto py-4"
                    onClick={() => handlePayment('cash')}
                    disabled={processingPayment}
                  >
                    <Banknote className="w-6 h-6" />
                    <span className="text-xs">Cash</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex flex-col items-center gap-1 h-auto py-4"
                    onClick={() => handlePayment('card')}
                    disabled={processingPayment}
                  >
                    <CreditCard className="w-6 h-6" />
                    <span className="text-xs">Card</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="flex flex-col items-center gap-1 h-auto py-4"
                    onClick={() => handlePayment('upi')}
                    disabled={processingPayment}
                  >
                    <Smartphone className="w-6 h-6" />
                    <span className="text-xs">UPI</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Printer Selector Dialog */}
      <PrinterSelector open={printerSelectorOpen} onOpenChange={setPrinterSelectorOpen} />
    </>
  );
}
