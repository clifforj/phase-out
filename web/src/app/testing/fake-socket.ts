import type { BridgeSocket, BridgeSocketFactory } from '../core/bridge-socket';
import type { ServerFrame } from '../core/protocol';

export class FakeSocket implements BridgeSocket {
  readonly sent: string[] = [];
  closed = false;

  onopen?: () => void;
  onmessage?: (data: string) => void;
  onclose?: () => void;
  onerror?: (message: string) => void;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  emit(frame: ServerFrame | Record<string, unknown>): void {
    this.onmessage?.(JSON.stringify(frame));
  }

  emitRaw(text: string): void {
    this.onmessage?.(text);
  }

  sentFrames<T = Record<string, unknown>>(): T[] {
    return this.sent.map((text) => JSON.parse(text) as T);
  }

  lastSentOfType<T = Record<string, unknown>>(type: string): T | undefined {
    return [...this.sentFrames<T & { type: string }>()].reverse().find((f) => f.type === type) as
      T | undefined;
  }
}

export function fakeSocketFactory(socket: FakeSocket): BridgeSocketFactory {
  return () => socket;
}
