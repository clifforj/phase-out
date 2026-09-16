import { TestBed } from '@angular/core/testing';
import { BRIDGE_SOCKET_FACTORY } from './bridge-socket';
import { Hello, ServerFrame, SUPPORTED_PROTOCOL_VERSION } from './protocol';
import { AuthStore, SESSION_TICKET_KEY } from './auth-store';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';
import { GameStore } from './game-store';

export function setUp(hello: Partial<Hello> | null = {}, options: { storedTicket?: string } = {}) {
  const socket = new FakeSocket();

  localStorage.clear();
  if (options.storedTicket) localStorage.setItem(SESSION_TICKET_KEY, options.storedTicket);
  TestBed.configureTestingModule({
    providers: [{ provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) }],
  });
  const store = TestBed.inject(GameStore);
  const auth = TestBed.inject(AuthStore);
  store.connect();
  socket.open();

  if (hello) socket.emit({ ...HELLO, ...hello });
  return { socket, store, auth };
}

export const HELLO: Hello = {
  type: 'hello',
  protocolVersion: SUPPORTED_PROTOCOL_VERSION,
  bridgeSessionId: 's',
  xmageServerHost: 'h',
  xmageServerPort: 1,
};

export function replay(socket: FakeSocket, frames: ServerFrame[]): void {
  for (const frame of frames) socket.emit(frame);
}

export function reconnect(socket: FakeSocket): void {
  vi.useFakeTimers();
  socket.onclose?.();
  vi.advanceTimersByTime(MAX_BACKOFF_MS);
  vi.useRealTimers();
  socket.open();
}

export const MAX_BACKOFF_MS = 11_000;

export function seatAsPlayer(socket: FakeSocket): void {
  socket.emit({
    type: 'gameStarted',
    gameId: 'g1',
    tableId: 't1',
    myPlayerId: 'p1',
    role: 'player',
  });
}
