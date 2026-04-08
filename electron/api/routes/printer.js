import { Router } from 'express';
import { listPrinters, connectPrinter, getConnectedPrinter, printBill, printKitchenTicket, disconnectPrinter } from '../../services/printerService.js';

const router = Router();

// GET /api/printer/list
router.get('/list', (req, res) => {
  try {
    const printers = listPrinters();
    const connected = getConnectedPrinter();
    res.json({ printers, connected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/printer/connect
router.post('/connect', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Printer name required' });
    const result = await connectPrinter(name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/printer/disconnect
router.post('/disconnect', (req, res) => {
  disconnectPrinter();
  res.json({ success: true });
});

// GET /api/printer/status
router.get('/status', (req, res) => {
  const connected = getConnectedPrinter();
  res.json({ connected: !!connected, printer: connected });
});

// POST /api/printer/print-bill
router.post('/print-bill', async (req, res) => {
  try {
    const result = await printBill(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/printer/print-kitchen
router.post('/print-kitchen', async (req, res) => {
  try {
    const result = await printKitchenTicket(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
