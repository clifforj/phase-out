import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SignInComponent } from './sign-in.component';
import { AuthStore, SESSION_TICKET_KEY } from '../core/auth-store';
import { BRIDGE_SOCKET_FACTORY } from '../core/bridge-socket';
import { GameStore } from '../core/game-store';
import { GIS_SCRIPT_URL } from '../core/google-identity';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';
import type { Hello, LoggedIn } from '../core/protocol';

function gisScripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script')).filter((script) =>
    script.src.startsWith(GIS_SCRIPT_URL),
  );
}

function render(options: { storedTicket?: string } = {}) {
  localStorage.clear();
  if (options.storedTicket) localStorage.setItem(SESSION_TICKET_KEY, options.storedTicket);
  history.replaceState({}, '', '/');

  const socket = new FakeSocket();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) },
    ],
  });
  const store = TestBed.inject(GameStore);
  const auth = TestBed.inject(AuthStore);
  store.connect();
  socket.open();

  const fixture = TestBed.createComponent(SignInComponent);
  const element = fixture.nativeElement as HTMLElement;
  const draw = () => {
    fixture.detectChanges();
    return element;
  };
  draw();

  return {
    socket,
    store,
    auth,
    draw,
    text: () => draw().textContent ?? '',
    button: (label: string) =>
      Array.from(draw().querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').toLowerCase().includes(label.toLowerCase()),
      ),
    field: () => draw().querySelector('input') as HTMLInputElement | null,
    hello: (overrides: Partial<Hello> = {}) =>
      socket.emit({
        type: 'hello',
        protocolVersion: 1,
        bridgeSessionId: 'bridge-1',
        xmageServerHost: 'localhost',
        xmageServerPort: 17171,
        ...overrides,
      }),
    loggedIn: (overrides: Partial<LoggedIn> = {}) =>
      socket.emit({
        type: 'loggedIn',
        userName: 'jclifford',
        serverVersion: '1.4.55',
        mainRoomId: 'room-1',
        ...overrides,
      } as LoggedIn),
  };
}

afterEach(() => {
  for (const script of gisScripts()) script.remove();
  localStorage.clear();
  history.replaceState({}, '', '/');
});

const REQUIRED_HELLO = {
  authMode: 'required' as const,
  googleClientId: 'client-1.apps.googleusercontent.com',
};

describe('SignInComponent', () => {
  describe('the Google step', () => {
    it('loads the GIS script only once a required bridge sends a client id', () => {
      const app = render();
      expect(gisScripts()).toHaveLength(0);

      app.hello(REQUIRED_HELLO);
      app.draw();

      expect(gisScripts()).toHaveLength(1);
    });

    it('says so, and loads nothing, when a required bridge sent no client id', () => {
      const app = render();
      app.hello({ authMode: 'required' });

      expect(app.text()).toContain('BRIDGE_GOOGLE_CLIENT_ID');
      expect(gisScripts()).toHaveLength(0);
    });

    it('shows a refused login, which is the one thing the reconnect loop will not tell you', () => {
      const app = render({ storedTicket: 'stale-ticket' });
      app.hello(REQUIRED_HELLO);

      app.socket.emit({
        type: 'failure',
        action: 'login',
        reason: 'ticket expired',
        code: 'authExpired',
      });

      expect(app.text()).toContain('expired');

      expect(app.auth.needsSignIn()).toBe(true);
    });

    it('lets a second credential reach the wire after the first was refused', () => {
      const app = render({ storedTicket: 'stale-ticket' });
      app.hello(REQUIRED_HELLO);
      app.socket.emit({ type: 'failure', action: 'login', reason: 'no', code: 'authExpired' });

      app.store.loginWithGoogleToken('a-fresh-google-token');

      expect(app.socket.lastSentOfType('login')).toMatchObject({
        googleToken: 'a-fresh-google-token',
      });
    });

    it('offers no way past the Google button on a bridge that requires one', () => {
      const app = render();
      app.hello(REQUIRED_HELLO);

      expect(app.button('guest')).toBeUndefined();
    });

    it('offers "continue as guest" on an off bridge', () => {
      const app = render();
      app.hello();

      app.button('guest')!.click();

      expect(app.auth.needsSignIn()).toBe(false);
    });
  });
});
