// WebUSB ESC/POS Thermal Printer Service
// Supports: Epson M325A, TVS RP3210, Epson TM-T82, POS80, and other ESC/POS compatible USB printers

import type { BillData } from './thermalPrinter';

// ESC/POS Command Constants
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const CMD = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_WIDTH_ON: [GS, 0x21, 0x10],
  DOUBLE_WIDTH_OFF: [GS, 0x21, 0x00],
  DOUBLE_SIZE_ON: [GS, 0x21, 0x11],
  DOUBLE_SIZE_OFF: [GS, 0x21, 0x00],
  PARTIAL_CUT: [GS, 0x56, 0x01],
  FEED_LINES: (n: number) => [ESC, 0x64, n],
};

// Known USB Vendor IDs for thermal printers
// Vendor-based filters for known thermal printers
const PRINTER_VENDOR_FILTERS = [
  { vendorId: 0x04B8 },  // Epson (M325A, TM-T82)
  { vendorId: 0x0DD4 },  // TVS Electronics (RP3210)
  { vendorId: 0x0FE6 },  // POS Printer
  { vendorId: 0x0483 },  // STMicroelectronics
  { vendorId: 0x1FC9 },  // NXP
  { vendorId: 0x20D1 },  // POS Printer
  { vendorId: 0x0416 },  // WinChipHead
  { vendorId: 0x1A86 },  // QinHeng (CH340)
  { vendorId: 0x067B },  // Prolific (PL2303)
  { vendorId: 0x0403 },  // FTDI
  { vendorId: 0x0525 },  // Netchip (Linux USB gadget)
  { vendorId: 0x154F },  // SNBC
  { vendorId: 0x0FE6 },  // Kontron
  { vendorId: 0x0AA7 },  // Beiyang
  { vendorId: 0x4B43 },  // Custom POS
  { vendorId: 0x0FE6 },  // ICS
  { vendorId: 0x2730 },  // Citizen
  { vendorId: 0x0B00 },  // Hewlett Packard POS
];

export interface USBPrinterDevice {
  name: string;
  vendorId: number;
  productId: number;
}

// Access navigator.usb safely
function getUSB(): any {
  return (navigator as any).usb;
}

class USBPrinterService {
  private device: any = null;
  private interfaceNumber: number = 0;
  private endpointOut: number = 0;

  isWebUSBAvailable(): boolean {
    return !!getUSB();
  }

  getConnectedPrinter(): USBPrinterDevice | null {
    if (!this.device) return null;
    return {
      name: this.device.productName || 'USB Printer',
      vendorId: this.device.vendorId,
      productId: this.device.productId,
    };
  }

  async requestDevice(): Promise<USBPrinterDevice> {
    const usb = getUSB();
    if (!usb) {
      throw new Error('WebUSB is not supported. Use Chrome or Edge browser.');
    }

    try {
      const device = await usb.requestDevice({ filters: PRINTER_VENDOR_FILTERS });
      await this.connectDevice(device);
      return {
        name: device.productName || 'USB Printer',
        vendorId: device.vendorId,
        productId: device.productId,
      };
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        throw new Error('No printer selected. Please select your thermal printer.');
      }
      throw new Error(`Failed to connect: ${error.message}`);
    }
  }

  async reconnectSavedDevice(): Promise<USBPrinterDevice | null> {
    const usb = getUSB();
    if (!usb) return null;

    try {
      const devices = await usb.getDevices();
      if (devices.length > 0) {
        await this.connectDevice(devices[0]);
        return {
          name: devices[0].productName || 'USB Printer',
          vendorId: devices[0].vendorId,
          productId: devices[0].productId,
        };
      }
    } catch {
      // Silent fail
    }
    return null;
  }

  private async connectDevice(device: any): Promise<void> {
    await device.open();

    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    const config = device.configuration;
    if (!config) throw new Error('No USB configuration available');

    let foundInterface = false;
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const outEndpoint = alt.endpoints.find(
          (ep: any) => ep.direction === 'out' && ep.type === 'bulk'
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
      throw new Error('Could not find printer endpoint. Ensure this is a supported ESC/POS printer.');
    }

    try {
      await device.claimInterface(this.interfaceNumber);
    } catch {
      // Already claimed
    }

    this.device = device;
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
        await this.device.close();
      } catch {
        // Ignore
      }
      this.device = null;
    }
  }

  private textEncoder = new TextEncoder();

  private buildReceipt(bill: BillData): Uint8Array {
    const parts: (number[] | Uint8Array)[] = [];
    const add = (data: number[] | Uint8Array) => parts.push(data);
    const text = (str: string) => add(this.textEncoder.encode(str));
    const nl = () => add([LF]);

    add(CMD.INIT);

    // Header
    add(CMD.ALIGN_CENTER);
    add(CMD.BOLD_ON);
    add(CMD.DOUBLE_WIDTH_ON);
    text(bill.restaurantName);
    nl();
    add(CMD.DOUBLE_WIDTH_OFF);
    add(CMD.BOLD_OFF);

    if (bill.restaurantAddress) { text(bill.restaurantAddress); nl(); }
    if (bill.restaurantPhone) { text(`Ph: ${bill.restaurantPhone}`); nl(); }
    if (bill.restaurantGstin) { text(`GSTIN: ${bill.restaurantGstin}`); nl(); }

    text('--------------------------------'); nl();

    // Table & Date
    add(CMD.ALIGN_LEFT);
    const billDate = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    text(`Table: ${bill.tableNumber || 'Takeaway'}`); nl();
    text(`Date: ${billDate}`); nl();
    text('--------------------------------'); nl();

    add(CMD.BOLD_ON);
    text('Item              Qty    Amount'); nl();
    add(CMD.BOLD_OFF);
    text('--------------------------------'); nl();

    for (const item of bill.items) {
      const itemName = item.name.substring(0, 16).padEnd(16);
      const qty = String(item.quantity).padStart(3);
      const amount = `${(item.price * item.quantity).toFixed(0)}`.padStart(8);
      text(`${itemName}${qty}${amount}`); nl();
    }

    text('--------------------------------'); nl();
    add(CMD.BOLD_ON);
    add(CMD.DOUBLE_SIZE_ON);
    add(CMD.ALIGN_RIGHT);
    text(`TOTAL: Rs.${bill.total.toFixed(2)}`); nl();
    add(CMD.DOUBLE_SIZE_OFF);
    add(CMD.BOLD_OFF);

    add(CMD.ALIGN_CENTER);
    text('--------------------------------'); nl();
    text('Thank you for dining with us!'); nl();
    text('Please visit again'); nl();

    add(CMD.FEED_LINES(4));
    add(CMD.PARTIAL_CUT);

    // Combine
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part instanceof Uint8Array ? part : new Uint8Array(part), offset);
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
      const chunkSize = 64;
      for (let i = 0; i < receiptData.length; i += chunkSize) {
        const chunk = receiptData.slice(i, i + chunkSize);
        await this.device.transferOut(this.endpointOut, chunk);
      }
    } catch (error: any) {
      console.error('USB print failed:', error);
      this.device = null;
      throw new Error('Print failed. Reconnect the printer and try again.');
    }
  }
}

export const usbPrinter = new USBPrinterService();
