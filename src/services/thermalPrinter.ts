// Thermal Printer Service - USB printing via local Express server API
import { localApi } from './localApi';

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
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  total: number;
}

class ThermalPrinterService {
  private connectedPrinter: string | null = null;

  async isBluetoothAvailable(): Promise<boolean> {
    // In desktop/localhost mode, we use USB printers via server API
    // Return true to enable the printer button in UI
    try {
      const status = await localApi.getPrinterStatus();
      return true;
    } catch {
      return false;
    }
  }

  async scanDevices(): Promise<PrinterDevice[]> {
    try {
      const result = await localApi.listPrinters();
      return (result.printers || []).map((name: string) => ({
        name,
        address: name,
      }));
    } catch (error) {
      console.error('Failed to list printers:', error);
      return [];
    }
  }

  async connect(device: PrinterDevice): Promise<void> {
    try {
      await localApi.connectPrinter(device.name);
      this.connectedPrinter = device.name;
    } catch (error) {
      console.error('Failed to connect to printer:', error);
      throw new Error(`Failed to connect to ${device.name}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await localApi.disconnectPrinter();
      this.connectedPrinter = null;
    } catch (error) {
      console.error('Failed to disconnect printer:', error);
    }
  }

  getConnectedDevice(): PrinterDevice | null {
    if (!this.connectedPrinter) return null;
    return { name: this.connectedPrinter, address: this.connectedPrinter };
  }

  async printViaBluetooth(bill: BillData): Promise<void> {
    // "Bluetooth" in this context means USB thermal printing via server
    try {
      await localApi.printBill(bill);
    } catch (error) {
      console.error('USB print failed:', error);
      throw new Error('Failed to print via USB thermal printer');
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
