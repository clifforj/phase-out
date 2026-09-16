import { InjectionToken } from '@angular/core';

export interface BridgeSocket {
  send(data: string): void;
  close(): void;
  onopen?: () => void;

  onmessage?: (data: string) => void;
  onclose?: () => void;
  onerror?: (message: string) => void;
}

export type BridgeSocketFactory = (url: string) => BridgeSocket;

export function webSocketFactory(url: string): BridgeSocket {
  const ws = new WebSocket(url);
  const socket: BridgeSocket = {
    send: (data) => ws.send(data),
    close: () => ws.close(),
  };
  ws.addEventListener('open', () => socket.onopen?.());
  ws.addEventListener('message', (event) => socket.onmessage?.(String(event.data)));
  ws.addEventListener('close', () => socket.onclose?.());

  ws.addEventListener('error', () => socket.onerror?.('websocket error'));
  return socket;
}

export const BRIDGE_SOCKET_FACTORY = new InjectionToken<BridgeSocketFactory>(
  'BRIDGE_SOCKET_FACTORY',
  { providedIn: 'root', factory: () => webSocketFactory },
);

export const BRIDGE_WS_PATH = '/ws';

export function bridgeUrl(location: { protocol: string; host: string } = window.location): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${BRIDGE_WS_PATH}`;
}
