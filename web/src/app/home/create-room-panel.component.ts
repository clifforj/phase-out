import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DeckStore } from '../core/deck-store';
import { GameStore } from '../core/game-store';
import { MAX_SEATS, Preferences } from '../core/preferences';
import { gameTypeForSeats } from '../core/protocol';
import { LogoComponent } from '../ui/logo.component';
import { VoidSceneComponent } from '../ui/void-scene.component';
import { DeckPickerComponent } from './deck-picker.component';
import { JoinConfirmDialogComponent } from './join-confirm.component';

type Mode = 'ai' | 'room';

@Component({
  selector: 'app-create-room-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeckPickerComponent, JoinConfirmDialogComponent, VoidSceneComponent, LogoComponent],
  templateUrl: './create-room-panel.component.html',
  styleUrl: './create-room-panel.component.css',
})
export class CreateRoomPanelComponent {
  protected readonly store = inject(GameStore);
  protected readonly decks = inject(DeckStore);
  protected readonly prefs = inject(Preferences);
  private readonly router = inject(Router);

  protected readonly maxSeats = MAX_SEATS;

  protected readonly joinTableId = signal('');

  protected readonly mode = signal<Mode>('ai');
  protected readonly seats = signal(this.prefs.seats());
  protected readonly roomName = signal('');

  private awaitingCreatedNav = false;

  private awaitingQuickGameNav = false;

  private quickGameFrom: string | null = null;

  protected readonly starting = signal(false);

  private failuresAtSubmit = 0;

  constructor() {
    effect(() => {
      const tableId = this.store.myTableId();
      if (tableId && this.awaitingCreatedNav) {
        this.awaitingCreatedNav = false;
        this.router.navigate(['/table', tableId]);
      }
    });

    effect(() => {
      const tableId = this.store.myTableId();
      const gameId = this.store.gameId();
      const seated = this.store.role() === 'player';

      if (!this.awaitingQuickGameNav || !seated || !tableId || !gameId) return;
      if (gameId === this.quickGameFrom) return;
      this.awaitingQuickGameNav = false;

      this.router.navigate(['/game', tableId]);
    });

    effect(() => {
      const failures = this.store.failures();
      if (!this.awaitingQuickGameNav || failures.length <= this.failuresAtSubmit) return;
      if (failures[failures.length - 1]?.action !== 'quickGame') return;
      this.awaitingQuickGameNav = false;
      this.starting.set(false);
    });
  }

  protected bumpSeats(by: number): void {
    this.seats.update((n) => Math.min(MAX_SEATS, Math.max(2, n + by)));
  }

  protected submit(): void {
    const players = this.seats();
    this.prefs.seats.set(players);

    if (this.mode() === 'ai') {
      this.awaitingQuickGameNav = true;
      this.quickGameFrom = this.store.gameId();
      this.failuresAtSubmit = this.store.failures().length;
      this.starting.set(true);
      this.store.quickGame(players - 1, gameTypeForSeats(players));
      return;
    }

    this.awaitingCreatedNav = true;
    this.store.createTable({
      players,
      aiOpponents: 0,
      name: this.roomName().trim() || undefined,
      gameType: gameTypeForSeats(players),
    });
  }

  protected readonly pendingJoinId = signal<string | null>(null);

  protected readonly pendingDeck = this.decks.selectedDeck;

  protected joinById(): void {
    const tableId = this.joinTableId().trim();
    if (!tableId) return;
    this.pendingJoinId.set(tableId);
  }

  protected confirmJoinById(): void {
    const tableId = this.pendingJoinId();
    if (!tableId) return;
    this.pendingJoinId.set(null);
    this.store.joinTable(tableId);
    this.router.navigate(['/table', tableId]);
  }

  protected cancelJoinById(): void {
    this.pendingJoinId.set(null);
  }
}
