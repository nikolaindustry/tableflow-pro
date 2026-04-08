import { Router } from 'express';
import { syncAll, getSyncStatus } from '../../services/syncService.js';

const router = Router();

// GET /api/sync/status
router.get('/status', (req, res) => {
  try {
    const status = getSyncStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/start
router.post('/start', async (req, res) => {
  try {
    const result = await syncAll((progress) => {
      console.log('[Sync Progress]', progress);
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
