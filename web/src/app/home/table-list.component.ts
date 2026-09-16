import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DeckStore } from '../core/deck-store';
import { GameStore } from '../core/game-store';
import { isWatchable, unwatchableReason } from '../core/protocol';
import type { TableSummary } from '../core/protocol';
import { AvatarComponent } from '../ui/avatar.component';
import { JoinConfirmDialogComponent } from './join-confirm.component';

@Component({
  selector: 'app-table-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, JoinConfirmDialogComponent],
  templateUrl: './table-list.component.html',
  styleUrl: './table-list.component.css',
})
export class TableListComponent {
  protected readonly store = inject(GameStore);
  protected readonly decks = inject(DeckStore);
  private readonly router = inject(Router);

  protected readonly pollSeconds = 3;

  private readonly pollingOn = signal(true);
  readonly polling = this.pollingOn.asReadonly();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.store.refreshTables();
    this.startPolling();
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  protected watchable = isWatchable;
  protected reason = unwatchableReason;

  protected filled(table: TableSummary): number {
    return table.seats.filter((seat) => !!seat.playerName).length;
  }

  protected joinable(table: TableSummary): boolean {
    return (
      this.store.loggedIn() &&
      table.stateCode === 'WAITING' &&
      !table.isTournament &&
      this.filled(table) < table.seats.length
    );
  }

  protected readonly pendingJoin = signal<TableSummary | null>(null);

  protected readonly pendingDeck = this.decks.selectedDeck;

  protected join(table: TableSummary): void {
    this.pendingJoin.set(table);
  }

  protected confirmJoin(): void {
    const table = this.pendingJoin();
    if (!table) return;
    this.pendingJoin.set(null);
    this.store.joinTable(table.tableId);
    this.router.navigate(['/table', table.tableId]);
  }

  protected cancelJoin(): void {
    this.pendingJoin.set(null);
  }

  protected watch(table: TableSummary): void {
    this.router.navigate(['/game', table.tableId]);
  }

  protected ago(at: number): string {
    const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
    return seconds < 2 ? 'just now' : `${seconds}s ago`;
  }

  protected togglePolling(event: Event): void {
    this.pollingOn.set((event.target as HTMLInputElement).checked);
    if (this.pollingOn()) this.startPolling();
    else this.stopPolling();
  }

  private startPolling(): void {
    this.stopPolling();
    this.timer = setInterval(() => {
      if (this.store.status() === 'open') this.store.refreshTables();
    }, this.pollSeconds * 1000);
  }

  private stopPolling(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
