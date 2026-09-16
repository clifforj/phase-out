import { TestBed } from '@angular/core/testing';
import { AuthStore, SESSION_TICKET_KEY } from './auth-store';
import type { Hello, LoggedIn } from './protocol';

function hello(overrides: Partial<Hello> = {}): Hello {
  return {
    type: 'hello',
    protocolVersion: 1,
    bridgeSessionId: 'bridge-1',
    xmageServerHost: 'localhost',
    xmageServerPort: 17171,
    ...overrides,
  };
}

function loggedIn(overrides: Partial<LoggedIn> = {}): LoggedIn {
  return {
    type: 'loggedIn',
    userName: 'jc',
    serverVersion: '1.4.55',
    mainRoomId: 'room-1',
    ...overrides,
  };
}

function setUp(options: { search?: string; storedTicket?: string } = {}) {
  localStorage.clear();
  if (options.storedTicket) localStorage.setItem(SESSION_TICKET_KEY, options.storedTicket);
  history.replaceState({}, '', options.search ?? '/');
  TestBed.configureTestingModule({});
  return TestBed.inject(AuthStore);
}

afterEach(() => {
  localStorage.clear();
  history.replaceState({}, '', '/');
});

describe('AuthStore', () => {
  it('offers a ticket left in localStorage by a previous session', () => {
    const auth = setUp({ storedTicket: 'ticket-from-last-time' });

    expect(auth.credential()).toEqual({ sessionToken: 'ticket-from-last-time' });
  });

  it('prefers the stored ticket over a fresh Google token', () => {
    const auth = setUp({ storedTicket: 'ticket-from-last-time' });
    auth.offerGoogleToken('google-id-token');

    expect(auth.credential()).toEqual({ sessionToken: 'ticket-from-last-time' });
  });

  it('sends the Google token when there is no ticket yet', () => {
    const auth = setUp();
    auth.offerGoogleToken('google-id-token');

    expect(auth.credential()).toEqual({ googleToken: 'google-id-token' });
  });

  it('stores the ticket from loggedIn and discards the Google token', () => {
    const auth = setUp();
    auth.offerGoogleToken('google-id-token');

    auth.onLoggedIn(loggedIn({ sessionToken: 'fresh-ticket', displayName: 'J. Cliff' }));

    expect(auth.credential()).toEqual({ sessionToken: 'fresh-ticket' });
    expect(localStorage.getItem(SESSION_TICKET_KEY)).toBe('fresh-ticket');
    expect(auth.account()).toEqual({
      userName: 'jc',
      playerName: undefined,
      displayName: 'J. Cliff',
      email: undefined,
      accountId: undefined,
    });
  });

  it('stores nothing in off mode, where loggedIn carries no ticket', () => {
    const auth = setUp();
    auth.onHello(hello());

    auth.onLoggedIn(loggedIn({ userName: 'web-a3f9c2' }));

    expect(localStorage.getItem(SESSION_TICKET_KEY)).toBeNull();
    expect(auth.credential()).toBeNull();
  });

  it('clears the stored ticket on authExpired', () => {
    const auth = setUp({ storedTicket: 'stale-ticket' });
    auth.onHello(hello({ authMode: 'required' }));

    auth.onLoginFailed('authExpired');

    expect(auth.credential()).toBeNull();
    expect(localStorage.getItem(SESSION_TICKET_KEY)).toBeNull();
    expect(auth.signInError()).toContain('expired');
    expect(auth.needsSignIn()).toBe(true);
  });

  it('clears the credential on authRejected', () => {
    const auth = setUp({ storedTicket: 'bad-ticket' });
    auth.onHello(hello({ authMode: 'required' }));

    auth.onLoginFailed('authRejected');

    expect(auth.credential()).toBeNull();
    expect(localStorage.getItem(SESSION_TICKET_KEY)).toBeNull();
  });

  it('keeps the ticket on sessionTakenOver', () => {
    const auth = setUp({ storedTicket: 'good-ticket' });
    auth.onHello(hello({ authMode: 'required' }));

    auth.onLoginFailed('sessionTakenOver');

    expect(auth.credential()).toEqual({ sessionToken: 'good-ticket' });
    expect(auth.signInError()).toContain('somewhere else');
  });

  it('keeps the credential on a failure code it does not know', () => {
    const auth = setUp({ storedTicket: 'good-ticket' });

    auth.onLoginFailed(undefined, 'the server exploded');

    expect(auth.credential()).toEqual({ sessionToken: 'good-ticket' });
    expect(auth.signInError()).toBe('the server exploded');
  });

  it('drops everything on sign-out', () => {
    const auth = setUp({ storedTicket: 'good-ticket' });
    auth.onHello(hello({ authMode: 'required' }));
    auth.onLoggedIn(loggedIn({ sessionToken: 'good-ticket' }));

    auth.signOut();

    expect(auth.credential()).toBeNull();
    expect(localStorage.getItem(SESSION_TICKET_KEY)).toBeNull();
    expect(auth.account()).toBeNull();
    expect(auth.needsSignIn()).toBe(true);
  });

  describe('ready', () => {
    it('is false before hello arrives', () => {
      const auth = setUp();

      expect(auth.ready()).toBe(false);
    });

    it('is true once hello says off mode', () => {
      const auth = setUp();
      auth.onHello(hello());

      expect(auth.ready()).toBe(true);
    });

    it('stays false in required mode until loggedIn actually arrives', () => {
      const auth = setUp({ storedTicket: 'ticket-from-last-time' });
      auth.onHello(hello({ authMode: 'required' }));

      expect(auth.needsSignIn()).toBe(false);
      expect(auth.ready()).toBe(false);
    });

    it('is true once loggedIn sets the account', () => {
      const auth = setUp({ storedTicket: 'ticket-from-last-time' });
      auth.onHello(hello({ authMode: 'required' }));

      auth.onLoggedIn(loggedIn());

      expect(auth.ready()).toBe(true);
    });

    it('does not become ready through a fixture query parameter', () => {
      const auth = setUp({ search: '/?fixture=spectator-duel' });

      expect(auth.ready()).toBe(false);
    });
  });

  describe('needsSignIn', () => {
    it('is false before hello, when the auth mode is not known yet', () => {
      const auth = setUp();

      expect(auth.authMode()).toBeNull();
      expect(auth.needsSignIn()).toBe(false);
    });

    it('is false in off mode', () => {
      const auth = setUp();
      auth.onHello(hello());

      expect(auth.authMode()).toBe('off');
      expect(auth.needsSignIn()).toBe(false);
    });

    it('treats a hello with no authMode as off — the fixture-compatibility guarantee', () => {
      const auth = setUp();
      auth.onHello(hello({ authMode: undefined }));

      expect(auth.authMode()).toBe('off');
    });

    it('is true in required mode with no credential', () => {
      const auth = setUp();
      auth.onHello(
        hello({ authMode: 'required', googleClientId: 'client-1.apps.googleusercontent.com' }),
      );

      expect(auth.needsSignIn()).toBe(true);
      expect(auth.googleClientId()).toBe('client-1.apps.googleusercontent.com');
    });

    it('is false in required mode when a ticket is held', () => {
      const auth = setUp({ storedTicket: 'ticket-from-last-time' });
      auth.onHello(hello({ authMode: 'required' }));

      expect(auth.needsSignIn()).toBe(false);
    });

    it('requires sign-in even with a fixture query parameter', () => {
      const auth = setUp({ search: '/?fixture=spectator-duel' });
      auth.onHello(hello({ authMode: 'required' }));

      expect(auth.needsSignIn()).toBe(true);
    });
  });
});
