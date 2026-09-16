import { Injectable, inject, signal } from '@angular/core';
import { BRIDGE_SOCKET_FACTORY, BridgeSocket, bridgeUrl } from './bridge-socket';
import type { ClientFrame, ServerFrame } from './protocol';

export type ConnectionStatus =
  'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'halted';

const FIRST_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class BridgeClient {
  private readonly socketFactory = inject(BRIDGE_SOCKET_FACTORY);

  readonly status = signal<ConnectionStatus>('idle');

  readonly reconnects = signal(0);
  readonly lastError = signal<string | null>(null);

  private socket: BridgeSocket | null = null;
  private retryMs = FIRST_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private wantOpen = false;
  private url = '';
  private onFrame: (frame: ServerFrame) => void = () => {};
  private onOpen: () => void = () => {};

  connect(handlers: {
    onFrame: (frame: ServerFrame) => void;
    onOpen?: () => void;
    url?: string;
  }): void {
    this.onFrame = handlers.onFrame;
    this.onOpen = handlers.onOpen ?? (() => {});
    this.url = handlers.url ?? bridgeUrl();
    this.wantOpen = true;
    this.open();
  }

  send(frame: ClientFrame): boolean {
    if (!this.socket || this.status() !== 'open') return false;
    this.socket.send(JSON.stringify(frame));
    return true;
  }

  close(): void {
    this.wantOpen = false;
    this.clearRetry();
    this.socket?.close();
    this.socket = null;
    this.status.set('closed');
  }

  halt(reason: string): void {
    this.wantOpen = false;
    this.clearRetry();
    this.lastError.set(reason);
    this.socket?.close();
    this.socket = null;
    this.status.set('halted');
  }

  private open(): void {
    this.status.set(this.reconnects() > 0 ? 'reconnecting' : 'connecting');
    let socket: BridgeSocket;
    try {
      socket = this.socketFactory(this.url);
    } catch (error) {
      this.lastError.set(String(error));
      this.scheduleRetry();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.retryMs = FIRST_RETRY_MS;
      this.status.set('open');
      this.lastError.set(null);
      this.onOpen();
    };

    socket.onmessage = (data) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(data) as ServerFrame;
      } catch {
        this.lastError.set(`could not parse a frame: ${data.slice(0, 120)}`);
        return;
      }
      this.onFrame(frame);
    };

    socket.onerror = (message) => this.lastError.set(message);

    socket.onclose = () => {
      this.socket = null;
      if (!this.wantOpen) return;
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    this.status.set('reconnecting');
    this.clearRetry();

    // Jitter prevents reconnecting clients from arriving together.
    const wait = this.retryMs * (0.7 + Math.random() * 0.6);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    this.retryTimer = setTimeout(() => {
      this.reconnects.update((n) => n + 1);
      this.open();
    }, wait);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
