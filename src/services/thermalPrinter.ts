import { Capacitor } from '@capacitor/core';
import { CapacitorThermalPrinter } from 'capacitor-thermal-printer';

export interface PrinterDevice {
  name: string;
  address: string;
}

export interface BillData {
  restaurantName: string;
  restaurantAddress?: string | null;
  restaurantPhone?: string | null;
  restaurantGstin?: string | null;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
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

  async isBluetoothAvailable(): Promise<boolean> {
    return this.isNative;
  }

  async scanDevices(): Promise<PrinterDevice[]> {
    if (!this.isNative) {
      throw new Error('Bluetooth scanning is only available on mobile devices');
    }

    return new Promise(async (resolve, reject) => {
      const devices: PrinterDevice[] = [];
      let listenerHandle: { remove: () => void } | null = null;
      
      try {
        // Set up listener for discovered devices
        listenerHandle = await CapacitorThermalPrinter.addListener('discoverDevices', (data: any) => {
          if (data.devices) {
            data.devices.forEach((device: any) => {
              if (!devices.find(d => d.address === device.address)) {
                devices.push({
                  name: device.name || 'Unknown Printer',
                  address: device.address,
                });
              }
            });
          }
        });

        // Start scanning
        await CapacitorThermalPrinter.startScan();
        
        // Stop scan after 5 seconds and resolve with found devices
        setTimeout(async () => {
          try {
            await CapacitorThermalPrinter.stopScan();
          } catch (e) {
            // Ignore stop errors
          }
          if (listenerHandle) {
            listenerHandle.remove();
          }
          resolve(devices);
        }, 5000);
      } catch (error) {
        if (listenerHandle) {
          listenerHandle.remove();
        }
        reject(new Error('Failed to scan for Bluetooth printers'));
      }
    });
  }

  async connect(device: PrinterDevice): Promise<void> {
    if (!this.isNative) {
      throw new Error('Bluetooth connection is only available on mobile devices');
    }

    try {
      await CapacitorThermalPrinter.connect({ address: device.address });
      this.connectedDevice = device;
    } catch (error) {
      console.error('Failed to connect to printer:', error);
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
        .text(`Table: ${bill.tableNumber || 'Takeaway'}\n`)
        .text(`Date: ${billDate}\n`)
        .text('--------------------------------\n')
        .bold()
        .text('Item              Qty    Amount\n')
        .clearFormatting()
        .text('--------------------------------\n');

      for (const item of bill.items) {
        const itemName = item.name.substring(0, 16).padEnd(16);
        const qty = String(item.quantity).padStart(3);
        const amount = `₹${(item.price * item.quantity).toFixed(0)}`.padStart(8);
        printer.text(`${itemName}${qty}${amount}\n`);
      }

      await printer
        .text('--------------------------------\n')
        .bold()
        .align('right')
        .text(`Grand Total: ₹${bill.total.toFixed(2)}\n`)
        .clearFormatting()
        .align('center')
        .text('\n')
        .text('Thank you for dining with us!\n')
        .text('Please visit again\n')
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
