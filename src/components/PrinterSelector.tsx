import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Bluetooth, BluetoothSearching, Check, Loader2, Unplug, Printer } from 'lucide-react';
import { PrinterDevice } from '@/services/thermalPrinter';
import { useThermalPrinter } from '@/hooks/useThermalPrinter';
import { toast } from 'sonner';

interface PrinterSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrinterSelector({ open, onOpenChange }: PrinterSelectorProps) {
  const {
    scanning,
    devices,
    connectedDevice,
    connecting,
    scanDevices,
    connect,
    disconnect,
    isBluetoothAvailable,
  } = useThermalPrinter();

  const [selectedDevice, setSelectedDevice] = useState<PrinterDevice | null>(null);

  const handleScan = async () => {
    try {
      await scanDevices();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleConnect = async (device: PrinterDevice) => {
    setSelectedDevice(device);
    try {
      await connect(device);
      toast.success(`Connected to ${device.name}`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSelectedDevice(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      toast.success('Printer disconnected');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (!isBluetoothAvailable) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              USB Printer
            </DialogTitle>
            <DialogDescription>
              No USB printers detected. Make sure the printer is connected and powered on.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Connect USB Printer
          </DialogTitle>
          <DialogDescription>
            Select a USB thermal printer from the list
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {connectedDevice && (
            <div className="flex items-center justify-between p-3 bg-success/10 border border-success/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-success" />
                <span className="font-medium">{connectedDevice.name}</span>
                <Badge variant="secondary" className="text-xs">Connected</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                <Unplug className="w-4 h-4" />
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <BluetoothSearching className="w-4 h-4 mr-2" />
                Scan for Printers
              </>
            )}
          </Button>

          {devices.length > 0 && (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {devices.map((device) => {
                  const isConnected = connectedDevice?.address === device.address;
                  const isConnecting = connecting && selectedDevice?.address === device.address;

                  return (
                    <button
                      key={device.address}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isConnected
                          ? 'bg-success/10 border-success/30'
                          : 'hover:bg-muted/50 border-border'
                      }`}
                      onClick={() => !isConnected && handleConnect(device)}
                      disabled={isConnecting || isConnected}
                    >
                      <div className="flex items-center gap-2">
                        <Bluetooth className="w-4 h-4 text-muted-foreground" />
                        <span>{device.name}</span>
                      </div>
                      {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isConnected ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {devices.length === 0 && !scanning && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click "Scan for Printers" to find connected USB printers
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
