import type { ControlMessage, OverlayMessage } from "@cso/shared";

type Listener<T> = (message: T) => void;

export class Broadcaster<T> {
  private readonly listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(message: T): void {
    for (const listener of this.listeners) listener(message);
  }
}

export class EventHub {
  readonly control = new Broadcaster<ControlMessage>();
  readonly overlay = new Broadcaster<OverlayMessage>();
}
