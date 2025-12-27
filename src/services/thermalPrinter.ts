import { Capacitor } from '@capacitor/core';
import { CapacitorThermalPrinter } from 'capacitor-thermal-printer';

export interface PrinterDevice {
  name: string;
  address: string;
  type?: 'classic' | 'ble' | 'unknown'; // Bluetooth device type
  rssi?: number; // Signal strength (useful for BLE)
}

export interface BillData {
  restaurantName: string;
  restaurantAddress?: string | null;
  restaurantPhone?: string | null;
  restaurantGstin?: string | null;
  tableNumber?: string;
  orderId?: string; // Order ID for barcode printing
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  total: number;
}

class ThermalPrinterService {
  private connectedDevice: PrinterDevice | null = null;
  private isNative = Capacitor.isNativePlatform();
  private supportsBLE = false; // Track if plugin supports BLE

  async isBluetoothAvailable(): Promise<boolean> {
    return this.isNative;
  }

  async checkBLESupport(): Promise<boolean> {
    if (!this.isNative) {
      return false;
    }

    try {
      // Check if the plugin has BLE-specific methods
      if (typeof CapacitorThermalPrinter.scanBLE === 'function' || 
          typeof CapacitorThermalPrinter.startBleScan === 'function') {
        this.supportsBLE = true;
        console.log('[ThermalPrinter] BLE support detected in plugin');
        return true;
      }
      
      console.log('[ThermalPrinter] No BLE-specific methods found - using Classic Bluetooth only');
      return false;
    } catch (error) {
      console.warn('[ThermalPrinter] Error checking BLE support:', error);
      return false;
    }
  }

  async checkPermissions(): Promise<boolean> {
    if (!this.isNative) {
      return false;
    }

    try {
      // Try to check current permission status without requesting
      if (typeof CapacitorThermalPrinter.checkPermissions === 'function') {
        const result = await CapacitorThermalPrinter.checkPermissions();
        console.log('[ThermalPrinter] Current permission status:', JSON.stringify(result));
        
        // Use similar logic as requestBluetoothPermissions to check status
        if (result && typeof result === 'object') {
          const values = Object.values(result);
          const hasGranted = values.some(v => v === 'granted' || v === 'authorized' || v === true);
          return hasGranted;
        }
      }
      
      console.log('[ThermalPrinter] checkPermissions not available in plugin');
      return false;
    } catch (error) {
      console.warn('[ThermalPrinter] Error checking permissions:', error);
      return false;
    }
  }

  async requestBluetoothPermissions(): Promise<boolean> {
    if (!this.isNative) {
      return false;
    }

    try {
      const result = await CapacitorThermalPrinter.requestPermissions();
      console.log('[ThermalPrinter] Permission request result:', JSON.stringify(result));
      
      // Handle different possible result formats from the plugin
      if (result === null || result === undefined) {
        console.warn('[ThermalPrinter] Permission result is null/undefined - assuming granted');
        return true; // Some plugins return nothing on success
      }
      
      if (typeof result === 'boolean') {
        return result;
      }
      
      if (typeof result === 'string') {
        return result === 'granted' || result === 'authorized';
      }
      
      if (typeof result === 'object') {
        // Log all keys for debugging
        console.log('[ThermalPrinter] Permission object keys:', Object.keys(result));
        console.log('[ThermalPrinter] Permission object values:', Object.values(result));
        
        // Check common permission result formats
        if (result.granted === true || result.granted === 'granted') return true;
        if (result.status === 'granted' || result.status === 'authorized') return true;
        if (result.state === 'granted' || result.state === 'authorized') return true;
        
        // Check Android-style permission results
        if (result.bluetoothScan === 'granted') return true;
        if (result.bluetoothConnect === 'granted') return true;
        if (result.bluetooth === 'granted') return true;
        if (result.location === 'granted') return true;
        
        // Check for permission arrays
        if (result.permissions && Array.isArray(result.permissions)) {
          const hasGranted = result.permissions.some((p: any) => 
            p === 'granted' || p.status === 'granted' || p.state === 'granted'
          );
          if (hasGranted) return true;
        }
        
        // If ANY value in the object is 'granted' or true, consider it sufficient
        const values = Object.values(result);
        const hasAnyGranted = values.some(v => 
          v === 'granted' || 
          v === 'authorized' || 
          v === true ||
          (typeof v === 'object' && v !== null && (v.status === 'granted' || v.state === 'granted'))
        );
        
        if (hasAnyGranted) {
          console.log('[ThermalPrinter] At least one permission granted');
          return true;
        }
        
        // Check if all values are NOT 'denied' (some plugins return 'prompt' before requesting)
        const allNotDenied = values.every(v => v !== 'denied' && v !== 'restricted');
        if (allNotDenied && values.length > 0) {
          console.log('[ThermalPrinter] No explicit denials detected, assuming granted');
          return true;
        }
      }
      
      console.warn('[ThermalPrinter] Could not determine permission status from result, denying by default');
      return false;
    } catch (error) {
      console.error('[ThermalPrinter] Failed to request Bluetooth permissions:', error);
      
      // If the plugin doesn't implement requestPermissions, try to proceed anyway
      // The Android system will show permission dialogs when needed
      if (error instanceof Error && 
          (error.message.includes('not implemented') || 
           error.message.includes('not available') ||
           error.message.includes('Unimplemented'))) {
        console.log('[ThermalPrinter] Plugin doesn\'t implement requestPermissions - assuming system handles it');
        return true;
      }
      
      return false;
    }
  }

  async scanDevices(): Promise<PrinterDevice[]> {
    if (!this.isNative) {
      throw new Error('Bluetooth scanning is only available on mobile devices');
    }

    console.log('[ThermalPrinter] Starting scan - checking permissions first...');
    
    // First check if permissions are already granted
    const alreadyGranted = await this.checkPermissions();
    console.log('[ThermalPrinter] Permissions already granted:', alreadyGranted);
    
    // Request permissions if not already granted
    let hasPermissions = alreadyGranted;
    if (!hasPermissions) {
      console.log('[ThermalPrinter] Requesting permissions...');
      hasPermissions = await this.requestBluetoothPermissions();
    }
    
    if (!hasPermissions) {
      const errorMsg = 'Bluetooth permissions are required to scan for printers. Please grant Bluetooth and Location permissions in your device settings.';
      console.error('[ThermalPrinter]', errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('[ThermalPrinter] Permissions confirmed - proceeding with scan');

    return new Promise(async (resolve, reject) => {
      const devices: PrinterDevice[] = [];
      let listenerHandle: { remove: () => void } | null = null;
      let scanTimeout: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (scanTimeout) {
          clearTimeout(scanTimeout);
          scanTimeout = null;
        }
        if (listenerHandle) {
          listenerHandle.remove();
          listenerHandle = null;
        }
      };
      
      try {
        // Set up listener for discovered devices
        listenerHandle = await CapacitorThermalPrinter.addListener('discoverDevices', (data: any) => {
          console.log('[ThermalPrinter] Discovery event received:', JSON.stringify(data));
          
          // Handle different event payload formats
          let deviceList: any[] = [];
          
          if (data.devices && Array.isArray(data.devices)) {
            // Standard format: { devices: [...] }
            deviceList = data.devices;
          } else if (data.device) {
            // Single device format: { device: {...} }
            deviceList = [data.device];
          } else if (data.name || data.address) {
            // Direct device data: { name: ..., address: ... }
            deviceList = [data];
          }
          
          deviceList.forEach((device: any) => {
            if (device && device.address) {
              // Only add if not already in list
              if (!devices.find(d => d.address === device.address)) {
                // Determine device type based on available info
                let deviceType: 'classic' | 'ble' | 'unknown' = 'unknown';
                
                // BLE devices typically have UUID-style addresses or specific type indicators
                if (device.type === 'BLE' || device.type === 'ble' || device.isBLE) {
                  deviceType = 'ble';
                } else if (device.type === 'CLASSIC' || device.type === 'classic' || device.type === 'SPP') {
                  deviceType = 'classic';
                } else if (device.address && device.address.includes('-')) {
                  // BLE devices often use UUID format with dashes
                  deviceType = 'ble';
                } else if (device.address && device.address.match(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)) {
                  // Classic Bluetooth uses MAC address format
                  deviceType = 'classic';
                }
                
                const deviceInfo: PrinterDevice = {
                  name: device.name || device.deviceName || 'Unknown Printer',
                  address: device.address || device.macAddress || device.id,
                  type: deviceType,
                  rssi: device.rssi || device.signalStrength,
                };
                
                console.log('[ThermalPrinter] Adding device:', deviceInfo);
                devices.push(deviceInfo);
              }
            }
          });
        });

        console.log('[ThermalPrinter] Starting Bluetooth scan...');
        
        // Start scanning
        await CapacitorThermalPrinter.startScan();
        
        // Extended scan time to 10 seconds for better device discovery
        scanTimeout = setTimeout(async () => {
          console.log('[ThermalPrinter] Scan timeout reached, found', devices.length, 'devices');
          
          try {
            await CapacitorThermalPrinter.stopScan();
          } catch (e) {
            console.warn('[ThermalPrinter] Error stopping scan:', e);
          }
          
          cleanup();
          resolve(devices);
        }, 10000); // Increased from 5s to 10s
        
      } catch (error) {
        console.error('[ThermalPrinter] Scan error:', error);
        cleanup();
        reject(new Error('Failed to scan for Bluetooth printers'));
      }
    });
  }

  async connect(device: PrinterDevice): Promise<void> {
    if (!this.isNative) {
      throw new Error('Bluetooth connection is only available on mobile devices');
    }

    try {
      console.log('[ThermalPrinter] Connecting to device:', device);
      await CapacitorThermalPrinter.connect({ address: device.address });
      this.connectedDevice = device;
      console.log('[ThermalPrinter] Successfully connected to:', device.name);
    } catch (error) {
      console.error('[ThermalPrinter] Failed to connect to printer:', error);
      this.connectedDevice = null;
      throw new Error(`Failed to connect to ${device.name}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isNative || !this.connectedDevice) return;

    try {
      await CapacitorThermalPrinter.disconnect();
      this.connectedDevice = null;
    } catch (error) {
      console.error('Failed to disconnect printer:', error);
    }
  }

  getConnectedDevice(): PrinterDevice | null {
    return this.connectedDevice;
  }

  async openAppSettings(): Promise<void> {
    if (!this.isNative) {
      console.warn('[ThermalPrinter] Cannot open app settings on non-native platform');
      return;
    }

    try {
      // Try to open app settings if the plugin supports it
      if (typeof CapacitorThermalPrinter.openSettings === 'function') {
        await CapacitorThermalPrinter.openSettings();
      } else {
        console.log('[ThermalPrinter] Plugin does not support opening settings');
        console.log('[ThermalPrinter] Please manually go to: Settings > Apps > TableFlow Pro > Permissions');
      }
    } catch (error) {
      console.error('[ThermalPrinter] Failed to open app settings:', error);
    }
  }

  async printViaBluetooth(bill: BillData): Promise<void> {
    if (!this.isNative) {
      throw new Error('Bluetooth printing is only available on mobile devices');
    }

    if (!this.connectedDevice) {
      throw new Error('No printer connected. Please connect a printer first.');
    }

    const billDate = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    try {
      // Build the receipt using ESC/POS commands
      const printer = CapacitorThermalPrinter.begin()
        .align('center')
        .bold()
        .doubleWidth()
        .text(`${bill.restaurantName}\n`)
        .clearFormatting()
        .align('center');

      if (bill.restaurantAddress) {
        printer.text(`${bill.restaurantAddress}\n`);
      }
      if (bill.restaurantPhone) {
        printer.text(`Phone: ${bill.restaurantPhone}\n`);
      }
      if (bill.restaurantGstin) {
        printer.text(`GSTIN: ${bill.restaurantGstin}\n`);
      }

      printer
        .text('--------------------------------\n')
        .align('left')
        .text(`Table: ${bill.tableNumber || 'Takeaway'}\n`);
      
      // Add Order ID if available
      if (bill.orderId) {
        printer.text(`Order: #${bill.orderId.substring(0, 8)}\n`);
      }
      
      printer
        .text(`Date: ${billDate}\n`)
        .text('--------------------------------\n')
        .bold()
        .text('Item           Qty     Amt\n')
        .clearFormatting()
        .text('--------------------------------\n');

      for (const item of bill.items) {
        const itemName = item.name.substring(0, 14).padEnd(14);
        const qty = String(item.quantity).padStart(3);
        const amount = `Rs.${(item.price * item.quantity).toFixed(0)}`.padStart(9);
        printer.text(`${itemName}${qty}${amount}\n`);
      }

      await printer
        .text('--------------------------------\n')
        .bold()
        .align('right')
        .text(`Grand Total: Rs.${bill.total.toFixed(2)}\n`)
        .clearFormatting()
        .align('center')
        .text('\n')
        .text('Thank you for dining with us!\n')
        .text('Please visit again\n');
      
      // Print Order ID barcode if available
      if (bill.orderId) {
        const barcodeType: 'CODE128' = 'CODE128';
        printer
          .text('\n')
          .align('center')
          .barcode(bill.orderId.substring(0, 12), barcodeType)
          .text(`#${bill.orderId.substring(0, 8)}\n`);
      }
      
      await printer
        .text('\n\n\n')
        .cutPaper()
        .write();
    } catch (error) {
      console.error('Bluetooth print failed:', error);
      throw new Error('Failed to print via Bluetooth');
    }
  }

  printViaBrowser(bill: BillData): void {
    const billDate = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const itemsHtml = bill.items
      .map(
        (item) => `
      <tr>
        <td style="padding: 6px 0;">${item.name}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: right;">₹${item.price.toFixed(2)}</td>
        <td style="text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `
      )
      .join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Please allow popups to print the bill');
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bill - ${bill.restaurantName}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; padding: 20px; max-width: 300px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 18px; margin: 0 0 5px 0; }
            .header p { margin: 2px 0; color: #666; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th { border-bottom: 1px dashed #000; padding: 6px 0; text-align: left; font-size: 11px; }
            th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
            .total-row { border-top: 1px dashed #000; font-weight: bold; }
            .total-row td { padding-top: 10px; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; }
            .divider { border-bottom: 1px dashed #000; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${bill.restaurantName}</h1>
            ${bill.restaurantAddress ? `<p>${bill.restaurantAddress}</p>` : ''}
            ${bill.restaurantPhone ? `<p>Phone: ${bill.restaurantPhone}</p>` : ''}
            ${bill.restaurantGstin ? `<p>GSTIN: ${bill.restaurantGstin}</p>` : ''}
          </div>
          <div class="divider"></div>
          <p><strong>Table:</strong> ${bill.tableNumber || 'Takeaway'}</p>
          <p><strong>Date:</strong> ${billDate}</p>
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="divider"></div>
          <table>
            <tr class="total-row">
              <td colspan="3"><strong>Grand Total</strong></td>
              <td style="text-align: right;"><strong>₹${bill.total.toFixed(2)}</strong></td>
            </tr>
          </table>
          <div class="footer">
            <p>Thank you for dining with us!</p>
            <p>Please visit again</p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.print();
  }
}

export const thermalPrinter = new ThermalPrinterService();
