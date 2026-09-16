import { Injectable, computed, signal } from '@angular/core';
import { readStorage, writeStorage } from './local-storage';
import { AuthMode, FailureCode, Hello, LoggedIn, authModeOf } from './protocol';

export const SESSION_TICKET_KEY = 'co.session.v1';

export interface Account {
  userName: string;

  playerName?: string;

  displayName?: string;
  email?: string;
  accountId?: string;
}

export type Credential = { googleToken: string } | { sessionToken: string };

export type SessionConflictStep = 'none' | 'asking' | 'declined';

const readStoredTicket = (): string | null => readStorage(SESSION_TICKET_KEY);
const writeStoredTicket = (ticket: string | null): void => writeStorage(SESSION_TICKET_KEY, ticket);

@Injectable({ providedIn: 'root' })
export class AuthStore {
  readonly authMode = signal<AuthMode | null>(null);
  readonly googleClientId = signal<string | null>(null);
  readonly account = signal<Account | null>(null);

  readonly signInError = signal<string | null>(null);

  // Persist the session ticket; keep the short-lived Google token in memory.
  private readonly googleToken = signal<string | null>(null);
  private readonly ticket = signal<string | null>(readStoredTicket());

  readonly sessionConflictStep = signal<SessionConflictStep>('none');

  readonly sessionConflictReason = signal<string | null>(null);

  readonly sessionConflictActiveGame = signal<boolean | null>(null);

  private readonly guest = signal(false);

  readonly needsSignIn = computed(() => {
    if (this.guest()) return false;
    if (this.authMode() !== 'required') return false;
    if (this.account() !== null) return false;
    return this.credential() === null;
  });

  readonly needsSessionDecision = computed(() => this.sessionConflictStep() !== 'none');

  readonly hasCredential = computed(() => this.credential() !== null);

  readonly ready = computed(() => {
    if (this.authMode() === null) return false;
    if (this.authMode() === 'off') return true;
    if (this.guest()) return true;
    return this.account() !== null;
  });

  credential(): Credential | null {
    const sessionToken = this.ticket();
    if (sessionToken) return { sessionToken };
    const googleToken = this.googleToken();
    if (googleToken) return { googleToken };
    return null;
  }

  offerGoogleToken(googleToken: string): void {
    this.signInError.set(null);
    this.googleToken.set(googleToken);
  }

  onHello(hello: Hello): void {
    this.authMode.set(authModeOf(hello));
    this.googleClientId.set(hello.googleClientId ?? null);
  }

  onLoggedIn(frame: LoggedIn): void {
    this.googleToken.set(null);
    this.signInError.set(null);
    if (frame.sessionToken) this.setTicket(frame.sessionToken);
    this.account.set({
      userName: frame.userName,
      playerName: frame.playerName,
      displayName: frame.displayName,
      email: frame.email,
      accountId: frame.accountId,
    });
  }

  onPlayerNameAccepted(playerName: string): void {
    const account = this.account();
    if (account) this.account.set({ ...account, playerName });
  }

  clearSessionConflict(): void {
    this.sessionConflictStep.set('none');
    this.sessionConflictReason.set(null);
    this.sessionConflictActiveGame.set(null);
  }

  declineSessionTakeover(): void {
    this.sessionConflictStep.set('declined');
  }

  retrySessionTakeover(): void {
    this.sessionConflictStep.set('none');
    this.sessionConflictReason.set(null);
    this.sessionConflictActiveGame.set(null);
  }

  continueAsGuest(): void {
    this.guest.set(true);
  }

  onLoginFailed(
    code: FailureCode | string | undefined,
    reason?: string,
    activeGame?: boolean,
  ): void {
    switch (code) {
      case 'authExpired':
        this.clearCredentials();
        this.signInError.set('Your session expired. Sign in again.');
        break;
      case 'authRejected':
        this.clearCredentials();
        this.signInError.set('Google could not confirm that sign-in. Try again.');
        break;
      case 'authRequired':
        this.clearCredentials();
        this.signInError.set('This server needs you to sign in.');
        break;
      case 'sessionTakenOver':
        this.signInError.set('This account signed in somewhere else.');
        break;
      case 'sessionInUse':
        this.sessionConflictReason.set(reason ?? 'This account is already open in another tab.');

        this.sessionConflictActiveGame.set(activeGame ?? null);
        this.sessionConflictStep.set('asking');
        break;
      default:
        this.signInError.set(reason ?? 'Sign-in failed.');
        break;
    }
  }

  signOut(): void {
    this.clearCredentials();
    this.account.set(null);
    this.signInError.set(null);
    this.guest.set(false);
  }

  private clearCredentials(): void {
    this.googleToken.set(null);
    this.setTicket(null);
  }

  private setTicket(ticket: string | null): void {
    this.ticket.set(ticket);
    writeStoredTicket(ticket);
  }
}
