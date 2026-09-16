import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { DeckStore } from '../core/deck-store';
import { GameStore } from '../core/game-store';
import { AvatarComponent } from '../ui/avatar.component';
import { LogoComponent } from '../ui/logo.component';
import { ManaPipsComponent } from '../ui/mana-pips.component';
import { VoidSceneComponent } from '../ui/void-scene.component';

@Component({
  selector: 'app-table-lobby',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, LogoComponent, ManaPipsComponent, VoidSceneComponent],
  templateUrl: './table-lobby.component.html',
  styleUrl: './table-lobby.component.css',
})
export class TableLobbyComponent {
  protected readonly store = inject(GameStore);
  protected readonly decks = inject(DeckStore);
  private readonly router = inject(Router);

  readonly tableId = input.required<string>();

  protected readonly table = computed(() =>
    this.store.tables().find((t) => t.tableId === this.tableId()),
  );
  protected readonly copied = signal(false);

  protected readonly isOwner = computed(() => {
    const name = this.store.myPlayerName();
    return !!name && this.table()?.controllerName === name;
  });

  protected readonly myDeck = this.decks.selectedDeck;

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.store.connect();
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 2000);
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) clearInterval(this.timer);
    });

    effect(() => {
      if (this.store.role() === 'player' && this.store.gameId()) {
        this.router.navigate(['/game', this.tableId()]);
      }
    });
  }

  protected isMe(seat: { playerName?: string }): boolean {
    return !!seat.playerName && seat.playerName === this.store.myPlayerName();
  }

  protected start(): void {
    if (!this.isOwner()) return;
    this.store.startMatch(this.tableId());
  }

  protected leave(): void {
    this.store.leaveTable(this.tableId());
    this.router.navigate(['/']);
  }

  protected copyLink(): void {
    const url = `${location.origin}/table/${this.tableId()}`;
    navigator.clipboard?.writeText(url).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  private refresh(): void {
    if (this.store.status() === 'open') this.store.refreshTables();
  }
}
