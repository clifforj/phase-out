import { WritableSignal } from '@angular/core';
import { AuthStore } from './auth-store';
import type { ClientFrame, LoggedIn } from './protocol';

export interface LoginFlowDeps {
  send: (frame: ClientFrame) => boolean;
  auth: Pick<
    AuthStore,
    | 'authMode'
    | 'credential'
    | 'onHello'
    | 'onLoggedIn'
    | 'onLoginFailed'
    | 'offerGoogleToken'
    | 'clearSessionConflict'
    | 'declineSessionTakeover'
    | 'retrySessionTakeover'
    | 'onPlayerNameAccepted'
    | 'signOut'
  >;
  userName: WritableSignal<string | null>;
  displayName: WritableSignal<string | null>;
  serverVersion: WritableSignal<string | null>;
  mainRoomId: WritableSignal<string | null>;
  xmageDropped: WritableSignal<boolean>;

  lobbyActionSinceLogin: WritableSignal<boolean>;
  toast: (level: 'INFO' | 'ERROR', text: string, title?: string) => void;

  halt: (reason: string) => void;

  onLoggedIn: () => void;
}

export class LoginFlow {
  private loginSent = false;

  private pendingPlayerName: string | null = null;

  constructor(private readonly deps: LoginFlowDeps) {}

  onOpen(): void {
    this.deps.userName.set(null);
    this.loginSent = false;
    this.sendLogin();
  }

  onHello(): void {
    this.sendLogin();
  }

  sendLogin(force = false): void {
    if (this.loginSent) return;
    const mode = this.deps.auth.authMode();

    if (mode === null) return;

    if (mode === 'off') {
      this.loginSent = this.deps.send({ type: 'login', userName: generateUserName() });
      return;
    }

    const credential = this.deps.auth.credential();
    if (!credential) return;
    this.loginSent = this.deps.send({
      type: 'login',
      ...credential,
      ...(force ? { force: true } : {}),
    });
  }

  confirmSessionTakeover(): void {
    this.deps.auth.clearSessionConflict();
    this.loginSent = false;
    this.sendLogin(true);
  }

  declineSessionTakeover(): void {
    this.deps.auth.declineSessionTakeover();
  }

  retrySessionTakeover(): void {
    this.deps.auth.retrySessionTakeover();
    this.loginSent = false;
    this.sendLogin();
  }

  loginWithGoogleToken(googleToken: string): void {
    this.deps.auth.offerGoogleToken(googleToken);
    this.sendLogin();
  }

  setPlayerName(playerName: string): void {
    this.pendingPlayerName = playerName;
    if (!this.deps.send({ type: 'setPlayerName', playerName })) {
      this.deps.toast('ERROR', 'not connected to the bridge - try again in a moment');
    }
  }

  signOutIdentity(): void {
    this.deps.auth.signOut();
    this.deps.userName.set(null);
    this.deps.displayName.set(null);
  }

  onLoggedInFrame(frame: LoggedIn): void {
    this.deps.auth.onLoggedIn(frame);
    this.deps.userName.set(frame.userName);
    this.deps.displayName.set(frame.displayName ?? null);
    this.deps.serverVersion.set(frame.serverVersion);
    this.deps.mainRoomId.set(frame.mainRoomId);
    this.deps.xmageDropped.set(false);

    this.deps.lobbyActionSinceLogin.set(false);
    this.deps.onLoggedIn();
  }

  onLoginFailure(code: string | undefined, reason: string, activeGame?: boolean): void {
    this.deps.auth.onLoginFailed(code, reason, activeGame);

    if (code === 'sessionTakenOver') {
      this.deps.halt(reason);
    }

    this.loginSent = false;
  }

  onAck(action: string): void {
    if (action === 'setPlayerName' && this.pendingPlayerName !== null) {
      this.deps.auth.onPlayerNameAccepted(this.pendingPlayerName);
      this.pendingPlayerName = null;
    }
  }
}

export function generateUserName(): string {
  return `web-${Math.random().toString(36).slice(2, 8)}`;
}
