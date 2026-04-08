import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Cloud, CloudOff, Loader2, Check } from 'lucide-react';
import { localApi } from '@/services/localApi';
import { toast } from 'sonner';

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await localApi.startSync();
      setLastSync(new Date().toLocaleTimeString());
      toast.success(`Sync complete! Pushed: ${result.pushed || 0}, Pulled: ${result.pulled || 0}`);
    } catch (error: any) {
      toast.error(error.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={syncing}
      className="gap-2"
      title={lastSync ? `Last synced: ${lastSync}` : 'Sync data to cloud'}
    >
      {syncing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : lastSync ? (
        <Check className="w-4 h-4 text-success" />
      ) : (
        <Cloud className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync'}</span>
    </Button>
  );
}
