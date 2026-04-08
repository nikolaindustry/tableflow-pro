import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { addClient, getClientCount } from './sse.js';

// Routes
import authRoutes from './routes/auth.js';
import restaurantRoutes from './routes/restaurants.js';
import orderRoutes from './routes/orders.js';
import menuRoutes from './routes/menu.js';
import tableRoutes from './routes/tables.js';
import kitchenRoutes from './routes/kitchens.js';
import staffRoutes from './routes/staff.js';
import expenseRoutes from './routes/expenses.js';
import printerRoutes from './routes/printer.js';
import syncRoutes from './routes/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer(port = 3000) {
  const app = express();

  // Middleware
  app.use(cors({ origin: '*' }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  // Request logging (minimal for performance)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      if (ms > 100) { // Only log slow requests
        console.log(`[API] ${req.method} ${req.url} - ${res.statusCode} (${ms}ms)`);
      }
    });
    next();
  });

  // SSE endpoint for real-time updates
  app.get('/api/events', (req, res) => {
    addClient(res);
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', clients: getClientCount(), uptime: process.uptime() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/restaurants', restaurantRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/tables', tableRoutes);
  app.use('/api/kitchens', kitchenRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/printer', printerRoutes);
  app.use('/api/sync', syncRoutes);

  // Serve static frontend (production build)
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath, {
    maxAge: '1h',
    etag: true,
  }));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.url.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'API endpoint not found' });
    }
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`[Server] TableFlow Pro running on http://0.0.0.0:${port}`);
      resolve({ app, server });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Server] Port ${port} busy, trying ${port + 1}...`);
        server.close();
        createServer(port + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}
