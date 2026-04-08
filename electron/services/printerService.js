import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { execSync } from 'child_process';

let activePrinter = null;
let activePrinterName = null;

// Detect available printers on Windows
export function listPrinters() {
  try {
    // Use PowerShell to enumerate printers
    const output = execSync('powershell -Command "Get-Printer | Select-Object Name, PortName, DriverName | ConvertTo-Json"', {
      encoding: 'utf-8',
      timeout: 5000
    });

    const printers = JSON.parse(output);
    const list = Array.isArray(printers) ? printers : [printers];

    // Filter for likely thermal/receipt printers
    return list.map(p => ({
      name: p.Name,
      port: p.PortName,
      driver: p.DriverName,
      isThermal: /epson|pos|thermal|receipt|tvs|tm-|rp\d/i.test(p.Name + ' ' + p.DriverName)
    }));
  } catch (err) {
    console.error('[Printer] Error listing printers:', err.message);
    return [];
  }
}

// Connect to a printer by name (Windows shared printer name)
export async function connectPrinter(printerName) {
  try {
    activePrinter = new ThermalPrinter({
      type: PrinterTypes.EPSON, // Works for most ESC/POS printers
      interface: `printer:${printerName}`,
      characterSet: CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
      lineCharacter: '-',
      options: {
        timeout: 5000,
      }
    });

    const isConnected = await activePrinter.isPrinterConnected();
    if (!isConnected) {
      // Try as STAR type fallback
      activePrinter = new ThermalPrinter({
        type: PrinterTypes.STAR,
        interface: `printer:${printerName}`,
        characterSet: CharacterSet.PC437_USA,
        removeSpecialCharacters: false,
      });
    }

    activePrinterName = printerName;
    console.log(`[Printer] Connected to: ${printerName}`);
    return { success: true, name: printerName };
  } catch (err) {
    console.error('[Printer] Connection error:', err);
    activePrinter = null;
    activePrinterName = null;
    throw new Error(`Failed to connect to printer: ${err.message}`);
  }
}

// Get current printer status
export function getConnectedPrinter() {
  return activePrinterName ? { name: activePrinterName, connected: true } : null;
}

// Print a receipt bill
export async function printBill(billData) {
  if (!activePrinter) {
    throw new Error('No printer connected. Please connect a printer first.');
  }

  const { restaurantName, restaurantAddress, restaurantPhone, restaurantGstin, tableNumber, items, total } = billData;
  const billDate = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  try {
    activePrinter.alignCenter();
    activePrinter.bold(true);
    activePrinter.setTextDoubleHeight();
    activePrinter.println(restaurantName);
    activePrinter.setTextNormal();
    activePrinter.bold(false);

    if (restaurantAddress) activePrinter.println(restaurantAddress);
    if (restaurantPhone) activePrinter.println(`Phone: ${restaurantPhone}`);
    if (restaurantGstin) activePrinter.println(`GSTIN: ${restaurantGstin}`);

    activePrinter.drawLine();
    activePrinter.alignLeft();
    activePrinter.println(`Table: ${tableNumber || 'Takeaway'}`);
    activePrinter.println(`Date: ${billDate}`);
    activePrinter.drawLine();

    activePrinter.bold(true);
    activePrinter.println(padColumns('Item', 'Qty', 'Amount'));
    activePrinter.bold(false);
    activePrinter.drawLine();

    for (const item of items) {
      const name = item.name.substring(0, 16);
      const qty = String(item.quantity);
      const amt = `Rs.${(item.price * item.quantity).toFixed(0)}`;
      activePrinter.println(padColumns(name, qty, amt));
    }

    activePrinter.drawLine();
    activePrinter.bold(true);
    activePrinter.alignRight();
    activePrinter.println(`Grand Total: Rs.${total.toFixed(2)}`);
    activePrinter.bold(false);
    activePrinter.alignCenter();
    activePrinter.newLine();
    activePrinter.println('Thank you for dining with us!');
    activePrinter.println('Please visit again');
    activePrinter.newLine();
    activePrinter.newLine();
    activePrinter.cut();

    await activePrinter.execute();
    console.log('[Printer] Bill printed successfully');
    return { success: true };
  } catch (err) {
    console.error('[Printer] Print error:', err);
    throw new Error(`Print failed: ${err.message}`);
  }
}

// Print a kitchen ticket
export async function printKitchenTicket(orderData) {
  if (!activePrinter) {
    throw new Error('No printer connected');
  }

  const { tableNumber, floorName, items, notes, orderId, createdAt } = orderData;
  const orderTime = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  try {
    activePrinter.alignCenter();
    activePrinter.bold(true);
    activePrinter.setTextDoubleHeight();
    activePrinter.println('KITCHEN ORDER');
    activePrinter.setTextNormal();
    activePrinter.bold(true);
    activePrinter.setTextDoubleHeight();
    activePrinter.println(tableNumber || 'TAKEAWAY');
    activePrinter.setTextNormal();
    activePrinter.bold(false);
    if (floorName) activePrinter.println(floorName);
    activePrinter.println(orderTime);
    activePrinter.drawLine();

    for (const item of items) {
      activePrinter.alignLeft();
      const type = item.food_type === 'veg' ? '[V]' : '[NV]';
      activePrinter.bold(true);
      activePrinter.println(`${type} ${item.name}  x${item.quantity}`);
      activePrinter.bold(false);
    }

    if (notes) {
      activePrinter.drawLine();
      activePrinter.println(`Notes: ${notes}`);
    }

    activePrinter.drawLine();
    activePrinter.alignCenter();
    activePrinter.println(`Order: ${orderId.slice(0, 8).toUpperCase()}`);
    activePrinter.newLine();
    activePrinter.cut();

    await activePrinter.execute();
    return { success: true };
  } catch (err) {
    throw new Error(`Kitchen ticket print failed: ${err.message}`);
  }
}

function padColumns(left, center, right) {
  const width = 32; // Standard 58mm thermal paper
  const leftStr = left.substring(0, 16).padEnd(16);
  const centerStr = center.padStart(4);
  const rightStr = right.padStart(width - 20);
  return leftStr + centerStr + rightStr;
}

export function disconnectPrinter() {
  activePrinter = null;
  activePrinterName = null;
  console.log('[Printer] Disconnected');
}
