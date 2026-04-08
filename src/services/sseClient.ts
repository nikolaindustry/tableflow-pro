// SSE Client for real-time updates (replaces Supabase realtime channels)

type EventCallback = (data: any) => void;

class SSEClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  connect() {
    if (this.eventSource) return;

    const url = `${window.location.origin}/api/events`;

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.connected = true;
        console.log('[SSE] Connected');
      };

      this.eventSource.onerror = () => {
        this.connected = false;
        this.eventSource?.close();
        this.eventSource = null;

        // Reconnect after 2 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 2000);
        }
      };

      // Listen for all event types
      const eventTypes = [
        'order_change', 'order_items_change', 'table_change',
        'menu_change', 'kitchen_change', 'staff_change',
        'restaurant_change',
      ];

      for (const type of eventTypes) {
        this.eventSource.addEventListener(type, (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            const callbacks = this.listeners.get(type);
            if (callbacks) {
              callbacks.forEach(cb => cb(data));
            }
          } catch (err) {
            console.error('[SSE] Parse error:', err);
          }
        });
      }
    } catch (err) {
      console.error('[SSE] Connection error:', err);
    }
  }

  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Auto-connect on first listener
    if (!this.eventSource) {
      this.connect();
    }

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  off(event: string, callback: EventCallback) {
    this.listeners.get(event)?.delete(callback);
  }

  isConnected() {
    return this.connected;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    this.listeners.clear();
  }
}

export const sseClient = new SSEClient();
