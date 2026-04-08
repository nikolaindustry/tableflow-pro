import { createClient } from '@supabase/supabase-js';
import { getDb } from '../database/db.js';

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.');
  }

  supabase = createClient(url, key);
  return supabase;
}

const SYNC_TABLES = [
  'restaurants', 'staff_members', 'floors', 'tables', 'kitchens',
  'menu_categories', 'menu_items', 'orders', 'order_items',
  'shifts', 'suppliers', 'expense_categories', 'expenses'
];

// Push local pending records to Supabase
async function pushToCloud(onProgress) {
  const db = getDb();
  const sb = getSupabase();
  let totalPushed = 0;

  for (const table of SYNC_TABLES) {
    const pending = db.prepare(`SELECT * FROM ${table} WHERE sync_status = 'pending'`).all();
    if (pending.length === 0) continue;

    onProgress?.({ table, count: pending.length, action: 'pushing' });

    for (const row of pending) {
      try {
        // Remove local-only columns
        const { sync_status, ...data } = row;

        // Convert SQLite booleans to actual booleans
        const cleaned = {};
        for (const [key, value] of Object.entries(data)) {
          if (key === 'is_active' || key === 'is_available' || key === 'is_occupied') {
            cleaned[key] = !!value;
          } else {
            cleaned[key] = value;
          }
        }

        const { error } = await sb.from(table).upsert(cleaned, { onConflict: 'id' });
        if (error) {
          console.error(`[Sync] Push error for ${table}:`, error.message);
          db.prepare(`UPDATE ${table} SET sync_status = 'conflict' WHERE id = ?`).run(row.id);
        } else {
          db.prepare(`UPDATE ${table} SET sync_status = 'synced' WHERE id = ?`).run(row.id);
          totalPushed++;
        }
      } catch (err) {
        console.error(`[Sync] Push error for ${table} row ${row.id}:`, err.message);
      }
    }
  }

  return totalPushed;
}

// Pull newer records from Supabase
async function pullFromCloud(onProgress) {
  const db = getDb();
  const sb = getSupabase();
  let totalPulled = 0;

  const lastSync = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_pull'").get();
  const since = lastSync?.value || '2000-01-01T00:00:00Z';

  for (const table of SYNC_TABLES) {
    onProgress?.({ table, action: 'pulling' });

    try {
      // Check if table has updated_at column
      const hasUpdatedAt = ['restaurants', 'orders', 'order_items', 'staff_members', 'shifts', 'expenses', 'profiles'].includes(table);
      let query = sb.from(table).select('*');

      if (hasUpdatedAt) {
        query = query.gt('updated_at', since);
      }

      const { data, error } = await query;
      if (error) {
        console.error(`[Sync] Pull error for ${table}:`, error.message);
        continue;
      }

      if (!data || data.length === 0) continue;

      // Upsert into local DB
      for (const row of data) {
        try {
          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(',');
          const updates = columns.map(c => `${c} = excluded.${c}`).join(',');

          db.prepare(`INSERT INTO ${table} (${columns.join(',')}, sync_status) VALUES (${placeholders}, 'synced') ON CONFLICT(id) DO UPDATE SET ${updates}, sync_status = 'synced'`).run(
            ...columns.map(c => row[c])
          );
          totalPulled++;
        } catch (err) {
          // Ignore individual row errors (schema mismatch, etc.)
        }
      }
    } catch (err) {
      console.error(`[Sync] Pull error for ${table}:`, err.message);
    }
  }

  // Update last pull timestamp
  db.prepare("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_pull', ?)").run(new Date().toISOString());

  return totalPulled;
}

// Full bidirectional sync
export async function syncAll(onProgress) {
  const startTime = Date.now();

  onProgress?.({ phase: 'push', message: 'Pushing local changes to cloud...' });
  const pushed = await pushToCloud(onProgress);

  onProgress?.({ phase: 'pull', message: 'Pulling updates from cloud...' });
  const pulled = await pullFromCloud(onProgress);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  const result = {
    pushed,
    pulled,
    duration: `${duration}s`,
    timestamp: new Date().toISOString()
  };

  onProgress?.({ phase: 'complete', ...result });
  console.log(`[Sync] Complete: pushed=${pushed}, pulled=${pulled}, duration=${duration}s`);

  return result;
}

// Get sync status
export function getSyncStatus() {
  const db = getDb();
  const pending = {};
  for (const table of SYNC_TABLES) {
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE sync_status = 'pending'`).get();
    if (count.cnt > 0) pending[table] = count.cnt;
  }

  const lastSync = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_pull'").get();

  return {
    pendingChanges: pending,
    totalPending: Object.values(pending).reduce((a, b) => a + b, 0),
    lastSync: lastSync?.value || null,
    hasCloudConfig: !!(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  };
}
