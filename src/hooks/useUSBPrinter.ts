import { useState, useCallback, useEffect } from 'react';
import { usbPrinter, USBPrinterDevice } from '@/services/usbPrinter';
import type { BillData } from '@/services/thermalPrinter';

export function useUSBPrinter() {
  const [connectedPrinter, setConnectedPrinter] = useState<USBPrinterDevice | null>(null);
  const [printing, setPrinting] = useState(false);
  const [isAvailable] = useState(() => usbPrinter.isWebUSBAvailable());

  // Auto-reconnect on mount
  useEffect(() => {
    if (isAvailable) {
      usbPrinter.reconnectSavedDevice().then((device) => {
        if (device) setConnectedPrinter(device);
      });
    }
  }, [isAvailable]);

  const connectPrinter = useCallback(async () => {
    const device = await usbPrinter.requestDevice();
    setConnectedPrinter(device);
    return device;
  }, []);

  const disconnectPrinter = useCallback(async () => {
    await usbPrinter.disconnect();
    setConnectedPrinter(null);
  }, []);

  const printBill = useCallback(async (bill: BillData) => {
    setPrinting(true);
    try {
      await usbPrinter.printBill(bill);
    } finally {
      setPrinting(false);
    }
  }, []);

  return {
    connectedPrinter,
    printing,
    isAvailable,
    connectPrinter,
    disconnectPrinter,
    printBill,
  };
}
