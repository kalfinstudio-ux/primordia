type Handler<T = unknown> = (payload: T) => void;

class EventBus {
  private listeners = new Map<string, Set<Handler<unknown>>>();

  on<T = unknown>(event: string, handler: Handler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  off<T = unknown>(event: string, handler: Handler<T>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as Handler<unknown>);
  }

  emit<T = unknown>(event: string, payload?: T): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }
  }
}

export const eventBus = new EventBus();
