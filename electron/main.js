import { app, BrowserWindow, Tray, Menu, dialog, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

let mainWindow = null;
let tray = null;
let serverInstance = null;
let actualPort = 3000;

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function startServer() {
  try {
    // Initialize database first
    const { getDb } = await import('./database/db.js');
    getDb();

    // Start Express server
    const { createServer } = await import('./api/server.js');
    const { server } = await createServer(3000);
    actualPort = server.address().port;
    console.log(`[Electron] Server started on port ${actualPort}`);
    return true;
  } catch (err) {
    console.error('[Electron] Failed to start server:', err);
    dialog.showErrorBox('Server Error', `Failed to start local server: ${err.message}`);
    return false;
  }
}

function createWindow() {
  const lanIp = getLanIp();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'TableFlow Pro',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  // Load from local Express server
  mainWindow.loadURL(`http://localhost:${actualPort}`);

  mainWindow.on('close', async (e) => {
    e.preventDefault();

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Sync & Close', 'Close Without Sync', 'Cancel'],
      defaultId: 0,
      title: 'Close TableFlow Pro',
      message: 'Do you want to sync data to cloud before closing?',
      detail: `LAN clients at http://${lanIp}:${actualPort} will be disconnected.`,
    });

    if (response === 2) return; // Cancel

    if (response === 0) {
      // Sync before close
      try {
        mainWindow.webContents.send('sync-status', 'Syncing...');
        const { syncAll } = await import('./services/syncService.js');
        await syncAll();
        console.log('[Electron] Sync completed before exit');
      } catch (err) {
        console.error('[Electron] Sync error on close:', err);
      }
    }

    // Cleanup
    const { closeDb } = await import('./database/db.js');
    closeDb();

    mainWindow.destroy();
    app.quit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const lanIp = getLanIp();

  // Create a simple tray icon
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'public', 'favicon.ico'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `TableFlow Pro - Running`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `LAN: http://${lanIp}:${actualPort}`,
      click: () => {
        const { clipboard } = require('electron');
        clipboard.writeText(`http://${lanIp}:${actualPort}`);
      }
    },
    {
      label: `Local: http://localhost:${actualPort}`,
      click: () => {
        if (mainWindow) mainWindow.focus();
        else createWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Sync Data to Cloud',
      click: async () => {
        try {
          const { syncAll } = await import('./services/syncService.js');
          const result = await syncAll();
          dialog.showMessageBox({
            type: 'info',
            title: 'Sync Complete',
            message: `Pushed: ${result.pushed}, Pulled: ${result.pulled}\nDuration: ${result.duration}`,
          });
        } catch (err) {
          dialog.showErrorBox('Sync Error', err.message);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (mainWindow) mainWindow.close();
        else app.quit();
      }
    }
  ]);

  tray.setToolTip(`TableFlow Pro | LAN: ${lanIp}:${actualPort}`);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  console.log('[Electron] Starting TableFlow Pro...');

  const started = await startServer();
  if (!started) {
    app.quit();
    return;
  }

  createWindow();
  createTray();

  const lanIp = getLanIp();
  console.log(`[Electron] Ready!`);
  console.log(`[Electron] Local:  http://localhost:${actualPort}`);
  console.log(`[Electron] LAN:    http://${lanIp}:${actualPort}`);
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
