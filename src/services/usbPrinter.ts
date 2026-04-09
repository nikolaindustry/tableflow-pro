// WebUSB ESC/POS Thermal Printer Service
// Supports: Epson M325A, TVS RP3210, Epson TM-T82, POS80, and other ESC/POS compatible USB printers

import type { BillData } from './thermalPrinter';

// ESC/POS Command Constants
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const CMD = {
  INIT: [ESC, 0x40],                    // Initialize printer
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_WIDTH_ON: [GS, 0x21, 0x10],
  DOUBLE_WIDTH_OFF: [GS, 0x21, 0x00],
  DOUBLE_HEIGHT_ON: [GS, 0x21, 0x01],
  DOUBLE_HEIGHT_OFF: [GS, 0x21, 0x00],
  DOUBLE_SIZE_ON: [GS, 0x21, 0x11],
  DOUBLE_SIZE_OFF: [GS, 0x21, 0x00],
  CUT_PAPER: [GS, 0x56, 0x00],          // Full cut
  PARTIAL_CUT: [GS, 0x56, 0x01],        // Partial cut
  FEED_LINES: (n: number) => [ESC, 0x64, n],
};

// Known USB Vendor IDs for thermal printers
const PRINTER_VENDOR_IDS = [
  { vendorId: 0x04B8, name: 'Epson' },           // Epson (M325A, TM-T82)
  { vendorId: 0x0DD4, name: 'TVS Electronics' },  // TVS (RP3210)
  { vendorId: 0x0FE6, name: 'POS Printer' },      // Generic POS
  { vendorId: 0x0483, name: 'STMicroelectronics' },// Some POS80 printers
  { vendorId: 0x1FC9, name: 'NXP' },              // Some POS printers
  { vendorId: 0x20D1, name: 'POS Printer' },      // Generic POS
  { vendorId: 0x0416, name: 'POS Printer' },      // WinChipHead (CH340 based)
  { vendorId: 0x1A86, name: 'QinHeng' },          // CH340/CH341 USB-Serial
  { vendorId: 0x067B, name: 'Prolific' },         // PL2303 USB-Serial
  { vendorId: 0x0403, name: 'FTDI' },             // FTDI USB-Serial
];

export interface USBPrinterDevice {
  device: USBDevice;
  name: string;
  vendorId: number;
  productId: number;
}

class USBPrinterService {
  private device: USBDevice | null = null;
  private interfaceNumber: number = 0;
  private endpointOut: number = 0;

  isWebUSBAvailable(): boolean {
    return 'usb' in navigator;
  }

  getConnectedPrinter(): USBPrinterDevice | null {
    if (!this.device) return null;
    return {
      device: this.device,
      name: this.device.productName || 'USB Printer',
      vendorId: this.device.vendorId,
      productId: this.device.productId,
    };
  }

  async requestDevice(): Promise<USBPrinterDevice> {
    if (!this.isWebUSBAvailable()) {
      throw new Error('WebUSB is not supported in this browser. Use Chrome or Edge.');
    }

    try {
      // Request any USB device - let user pick their printer
      const device = await navigator.usb.requestDevice({
        filters: [
          ...PRINTER_VENDOR_IDS.map(v => ({ vendorId: v.vendorId })),
          // Also allow class-based filter for printer devices (class 7)
        ],
      });

      await this.connectDevice(device);

      return {
        device,
        name: device.productName || 'USB Printer',
        vendorId: device.vendorId,
        productId: device.productId,
      };
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        throw new Error('No printer selected. Please select your thermal printer.');
      }
      throw new Error(`Failed to connect printer: ${error.message}`);
    }
  }

  async reconnectSavedDevice(): Promise<USBPrinterDevice | null> {
    if (!this.isWebUSBAvailable()) return null;

    try {
      const devices = await navigator.usb.getDevices();
      if (devices.length > 0) {
        // Try to reconnect to the first previously paired device
        await this.connectDevice(devices[0]);
        return {
          device: devices[0],
          name: devices[0].productName || 'USB Printer',
          vendorId: devices[0].vendorId,
          productId: devices[0].productId,
        };
      }
    } catch {
      // Silent fail on auto-reconnect
    }
    return null;
  }

  private async connectDevice(device: USBDevice): Promise<void> {
    await device.open();

    // Try to find the right interface and endpoint
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    const config = device.configuration;
    if (!config) throw new Error('No USB configuration available');

    // Find a bulk OUT endpoint
    let foundInterface = false;
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        // Look for printer class (7) or vendor-specific
        const outEndpoint = alt.endpoints.find(
          ep => ep.direction === 'out' && ep.type === 'bulk'
        );
        if (outEndpoint) {
          this.interfaceNumber = iface.interfaceNumber;
          this.endpointOut = outEndpoint.endpointNumber;
          foundInterface = true;
          break;
        }
      }
      if (foundInterface) break;
    }

    if (!foundInterface) {
      throw new Error('Could not find printer endpoint. Make sure this is a supported thermal printer.');
    }

    try {
      await device.claimInterface(this.interfaceNumber);
    } catch {
      // Interface might already be claimed
    }

    this.device = device;
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
        await this.device.close();
      } catch {
        // Ignore disconnect errors
      }
      this.device = null;
    }
  }

  private textEncoder = new TextEncoder();

  private encode(text: string): Uint8Array {
    return this.textEncoder.encode(text);
  }

  private buildReceipt(bill: BillData): Uint8Array {
    const parts: (number[] | Uint8Array)[] = [];

    const add = (data: number[] | Uint8Array) => parts.push(data);
    const text = (str: string) => add(this.encode(str));
    const newline = () => add([LF]);

    // Initialize
    add(CMD.INIT);

    // Header - Restaurant name (centered, bold, double width)
    add(CMD.ALIGN_CENTER);
    add(CMD.BOLD_ON);
    add(CMD.DOUBLE_WIDTH_ON);
    text(bill.restaurantName);
    newline();
    add(CMD.DOUBLE_WIDTH_OFF);
    add(CMD.BOLD_OFF);

    if (bill.restaurantAddress) {
      text(bill.restaurantAddress);
      newline();
    }
    if (bill.restaurantPhone) {
      text(`Ph: ${bill.restaurantPhone}`);
      newline();
    }
    if (bill.restaurantGstin) {
      text(`GSTIN: ${bill.restaurantGstin}`);
      newline();
    }

    // Divider
    text('--------------------------------');
    newline();

    // Table & Date (left aligned)
    add(CMD.ALIGN_LEFT);
    const billDate = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    text(`Table: ${bill.tableNumber || 'Takeaway'}`);
    newline();
    text(`Date: ${billDate}`);
    newline();

    // Items header
    text('--------------------------------');
    newline();
    add(CMD.BOLD_ON);
    text('Item              Qty    Amount');
    newline();
    add(CMD.BOLD_OFF);
    text('--------------------------------');
    newline();

    // Items
    for (const item of bill.items) {
      const itemName = item.name.substring(0, 16).padEnd(16);
      const qty = String(item.quantity).padStart(3);
      const amount = `${(item.price * item.quantity).toFixed(0)}`.padStart(8);
      text(`${itemName}${qty}${amount}`);
      newline();
    }

    // Total
    text('--------------------------------');
    newline();
    add(CMD.BOLD_ON);
    add(CMD.DOUBLE_SIZE_ON);
    add(CMD.ALIGN_RIGHT);
    text(`TOTAL: Rs.${bill.total.toFixed(2)}`);
    newline();
    add(CMD.DOUBLE_SIZE_OFF);
    add(CMD.BOLD_OFF);

    // Footer
    add(CMD.ALIGN_CENTER);
    text('--------------------------------');
    newline();
    text('Thank you for dining with us!');
    newline();
    text('Please visit again');
    newline();

    // Feed and cut
    add(CMD.FEED_LINES(4));
    add(CMD.PARTIAL_CUT);

    // Combine all parts
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      if (part instanceof Uint8Array) {
        result.set(part, offset);
      } else {
        result.set(new Uint8Array(part), offset);
      }
      offset += part.length;
    }

    return result;
  }

  async printBill(bill: BillData): Promise<void> {
    if (!this.device) {
      throw new Error('No printer connected. Please connect a USB thermal printer first.');
    }

    const receiptData = this.buildReceipt(bill);

    try {
      // Send in chunks of 64 bytes for reliability
      const chunkSize = 64;
      for (let i = 0; i < receiptData.length; i += chunkSize) {
        const chunk = receiptData.slice(i, i + chunkSize);
        await this.device.transferOut(this.endpointOut, chunk);
      }
    } catch (error: any) {
      console.error('USB print failed:', error);
      // Try to reconnect
      this.device = null;
      throw new Error('Print failed. Please reconnect the printer and try again.');
    }
  }
}

export const usbPrinter = new USBPrinterService();
