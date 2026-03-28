type EventHandler<T = unknown> = (data: T) => void;

interface SSEOptions {
  url: string;
  events: Record<string, EventHandler>;
  onError?: () => void;
}

export function createSSE(options: SSEOptions): () => void {
  let eventSource: EventSource | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  let closed = false;

  function connect() {
    if (closed) return;

    eventSource = new EventSource(options.url, { withCredentials: true });

    eventSource.onopen = () => {
      retryCount = 0;
    };

    for (const [event, handler] of Object.entries(options.events)) {
      eventSource.addEventListener(event, ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handler(data);
        } catch {
          console.error(`Failed to parse SSE event ${event}:`, e.data);
        }
      }) as EventListener);
    }

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;

      if (closed) return;

      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      retryCount++;
      retryTimeout = setTimeout(connect, delay);
      options.onError?.();
    };
  }

  connect();

  // Return cleanup function
  return () => {
    closed = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    eventSource?.close();
    eventSource = null;
  };
}
