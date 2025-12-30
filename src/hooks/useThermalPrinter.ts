import { useState, useCallback, useEffect } from 'react';
import { thermalPrinter, PrinterDevice, BillData } from '@/services/thermalPrinter';

export function useThermalPrinter() {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [isBluetoothAvailable, setIsBluetoothAvailable] = useState(false);

  useEffect(() => {
    thermalPrinter.isBluetoothAvailable().then(setIsBluetoothAvailable);
    setConnectedDevice(thermalPrinter.getConnectedDevice());
  }, []);

  // Poll for connected device status to keep UI in sync
  useEffect(() => {
    const interval = setInterval(() => {
      const device = thermalPrinter.getConnectedDevice();
      setConnectedDevice(device);
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, []);

  const scanDevices = useCallback(async () => {
    setScanning(true);
    try {
      const foundDevices = await thermalPrinter.scanDevices();
      setDevices(foundDevices);
      return foundDevices;
    } finally {
      setScanning(false);
    }
  }, []);

  const connect = useCallback(async (device: PrinterDevice) => {
    setConnecting(true);
    try {
      await thermalPrinter.connect(device);
      setConnectedDevice(device);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await thermalPrinter.disconnect();
    setConnectedDevice(null);
  }, []);

  const printBill = useCallback(async (bill: BillData, useBluetooth: boolean = false) => {
    setPrinting(true);
    try {
      if (useBluetooth) {
        if (!isBluetoothAvailable) {
          throw new Error('Bluetooth printing is not available on this device');
        }
        console.log('[useThermalPrinter] Printing via Bluetooth...');
        await thermalPrinter.printViaBluetooth(bill);
        console.log('[useThermalPrinter] Bluetooth print completed successfully');
      } else {
        console.log('[useThermalPrinter] Printing via browser...');
        thermalPrinter.printViaBrowser(bill);
      }
    } catch (error) {
      console.error('[useThermalPrinter] Print failed:', error);
      throw error; // Re-throw so caller can handle it
    } finally {
      setPrinting(false);
    }
  }, [isBluetoothAvailable]);

  const checkPermissions = useCallback(async () => {
    return await thermalPrinter.checkPermissions();
  }, []);

  const requestPermissions = useCallback(async () => {
    return await thermalPrinter.requestBluetoothPermissions();
  }, []);

  const openSettings = useCallback(async () => {
    await thermalPrinter.openAppSettings();
  }, []);

  return {
    scanning,
    devices,
    connectedDevice,
    connecting,
    printing,
    isBluetoothAvailable,
    scanDevices,
    connect,
    disconnect,
    printBill,
    checkPermissions,
    requestPermissions,
    openSettings,
  };
}
