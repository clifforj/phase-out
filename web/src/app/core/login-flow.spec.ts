import { SESSION_TICKET_KEY } from './auth-store';
import { HELLO, MAX_BACKOFF_MS, reconnect, setUp } from './testing-support';

describe('logging in against a bridge that wants a credential', () => {
  afterEach(() => localStorage.clear());

  it('sends nothing and asks for a sign-in when it holds no credential', () => {
    const { socket, auth } = setUp({ authMode: 'required', googleClientId: 'client-1' });

    expect(socket.lastSentOfType('login')).toBeUndefined();
    expect(auth.needsSignIn()).toBe(true);
    expect(auth.googleClientId()).toBe('client-1');
  });

  it('presents a ticket that survived the reload, and again on every reconnect', () => {
    const { socket } = setUp({ authMode: 'required' }, { storedTicket: 'ticket-1' });

    expect(socket.lastSentOfType('login')).toEqual({ type: 'login', sessionToken: 'ticket-1' });

    reconnect(socket);
    socket.emit(HELLO);
    const logins = socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login');
    expect(logins).toHaveLength(2);
    expect(logins[1]).toEqual({ type: 'login', sessionToken: 'ticket-1' });
  });

  it('never sends a generated user name once a credential is wanted', () => {
    const { socket, store } = setUp({ authMode: 'required' });
    store.loginWithGoogleToken('google-id-token');

    expect(socket.lastSentOfType('login')).toEqual({
      type: 'login',
      googleToken: 'google-id-token',
    });
  });

  it('keeps the XMage handle and the greeting name apart', () => {
    const { socket, store, auth } = setUp({ authMode: 'required' }, { storedTicket: 'ticket-1' });
    socket.emit({
      type: 'loggedIn',
      userName: 'jc',
      displayName: 'John Clifford',
      serverVersion: '1.4.55',
      mainRoomId: 'room-1',
      sessionToken: 'ticket-2',
    });

    expect(store.userName()).toBe('jc');
    expect(store.displayName()).toBe('John Clifford');

    expect(auth.credential()).toEqual({ sessionToken: 'ticket-2' });
  });

  it('does not retry a refused login', () => {
    const { socket, auth } = setUp({ authMode: 'required' }, { storedTicket: 'stale-ticket' });
    expect(socket.lastSentOfType('login')).toBeDefined();

    socket.emit({
      type: 'failure',
      action: 'login',
      reason: 'session expired',
      code: 'authExpired',
    });

    expect(socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login')).toHaveLength(1);
    expect(socket.closed).toBe(false);

    expect(auth.credential()).toBeNull();
    expect(auth.needsSignIn()).toBe(true);
  });

  it('drops the ticket, tells the bridge, and comes back on a fresh socket', () => {
    const { socket, store, auth } = setUp({ authMode: 'required' }, { storedTicket: 'ticket-1' });
    socket.emit({
      type: 'loggedIn',
      userName: 'jc',
      displayName: 'John Clifford',
      serverVersion: '1.4.55',
      mainRoomId: 'room-1',
      sessionToken: 'ticket-2',
    });
    expect(store.loggedIn()).toBe(true);

    store.signOut();

    expect(socket.lastSentOfType('signOut')).toEqual({ type: 'signOut' });

    expect(auth.credential()).toBeNull();
    expect(localStorage.getItem(SESSION_TICKET_KEY)).toBeNull();
    expect(store.userName()).toBeNull();
    expect(store.displayName()).toBeNull();
    expect(socket.closed).toBe(true);

    const before = socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login').length;
    socket.open();
    socket.emit({ ...HELLO, authMode: 'required' });
    expect(socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login')).toHaveLength(
      before,
    );
    expect(auth.needsSignIn()).toBe(true);
  });

  it('stops for good when the account is opened in another tab', () => {
    const { socket, store, auth } = setUp({ authMode: 'required' }, { storedTicket: 'ticket-1' });
    const before = socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login').length;

    socket.emit({
      type: 'failure',
      action: 'login',
      reason: 'this account was opened in another tab',
      code: 'sessionTakenOver',
    });

    expect(store.status()).toBe('halted');
    expect(store.transportError()).toContain('another tab');

    vi.useFakeTimers();
    socket.onclose?.();
    vi.advanceTimersByTime(MAX_BACKOFF_MS * 5);
    vi.useRealTimers();
    expect(store.status()).toBe('halted');
    expect(socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login')).toHaveLength(
      before,
    );

    expect(auth.credential()).toEqual({ sessionToken: 'ticket-1' });
  });

  describe('when a login would take over an account open elsewhere', () => {
    function askForTakeover() {
      const setup = setUp({ authMode: 'required' }, { storedTicket: 'ticket-1' });
      setup.socket.emit({
        type: 'failure',
        action: 'login',
        reason: 'this account is already open in another tab',
        code: 'sessionInUse',
      });
      return setup;
    }

    it('asks rather than retrying, and keeps the socket and the ticket', () => {
      const { socket, store, auth } = askForTakeover();
      const before = socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login').length;

      expect(auth.sessionConflictStep()).toBe('asking');
      expect(auth.needsSessionDecision()).toBe(true);
      expect(store.status()).not.toBe('halted');
      expect(auth.credential()).toEqual({ sessionToken: 'ticket-1' });

      vi.useFakeTimers();
      vi.advanceTimersByTime(MAX_BACKOFF_MS * 5);
      vi.useRealTimers();
      expect(socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login')).toHaveLength(
        before,
      );
    });

    it('"continue here" resends the login with force, once', () => {
      const { socket, store, auth } = askForTakeover();

      store.confirmSessionTakeover();

      expect(auth.needsSessionDecision()).toBe(false);
      const last = socket.lastSentOfType<{ sessionToken?: string; force?: boolean }>('login');
      expect(last).toEqual({ type: 'login', sessionToken: 'ticket-1', force: true });
    });

    it('"cancel" stays put without sending anything, and "try again" re-asks unforced', () => {
      const { socket, store, auth } = askForTakeover();
      const before = socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login').length;

      store.declineSessionTakeover();
      expect(auth.sessionConflictStep()).toBe('declined');
      expect(socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login')).toHaveLength(
        before,
      );

      store.retrySessionTakeover();
      expect(auth.sessionConflictStep()).toBe('none');
      const last = socket.lastSentOfType<{ sessionToken?: string; force?: boolean }>('login');
      expect(last).toEqual({ type: 'login', sessionToken: 'ticket-1' });
    });

    it('carries whether the other tab has a game in progress, through to the holding screen', () => {
      const { socket, auth } = setUp({ authMode: 'required' }, { storedTicket: 'ticket-1' });

      socket.emit({
        type: 'failure',
        action: 'login',
        reason: 'this account is already open in another tab',
        code: 'sessionInUse',
        activeGame: true,
      });

      expect(auth.sessionConflictActiveGame()).toBe(true);
    });

    it('reads a missing activeGame as unknown, not "no"', () => {
      const { auth } = askForTakeover();

      expect(auth.sessionConflictActiveGame()).toBeNull();
    });
  });

  it('does not toast a refused login — the overlay already shows it', () => {
    const { socket, store } = setUp({ authMode: 'required' }, { storedTicket: 'ticket-1' });

    socket.emit({
      type: 'failure',
      action: 'login',
      reason: 'this account is already open in another tab',
      code: 'sessionInUse',
    });

    expect(store.toasts()).toHaveLength(0);
  });
});
