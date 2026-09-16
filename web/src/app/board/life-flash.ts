import { signal } from '@angular/core';
import type { GameStateView } from '../core/protocol';

export const LIFE_FLASH_MS = 3_000;

export const EMPTY_LIFE_CHANGE: ReadonlyMap<string, number> = new Map();

export class LifeFlashTracker {
  readonly changes = signal<ReadonlyMap<string, number>>(EMPTY_LIFE_CHANGE);
  private readonly lifeSeen = new Map<string, number>();
  private readonly lifePending = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  track(game: GameStateView | null): void {
    if (!game) {
      this.lifeSeen.clear();
      this.clear();
      return;
    }
    let moved = false;
    for (const player of game.players) {
      const before = this.lifeSeen.get(player.playerId);
      this.lifeSeen.set(player.playerId, player.life);
      if (before === undefined || before === player.life) continue;
      this.lifePending.set(
        player.playerId,
        (this.lifePending.get(player.playerId) ?? 0) + (player.life - before),
      );
      moved = true;
    }
    if (!moved) return;
    for (const [playerId, delta] of this.lifePending)
      if (delta === 0) this.lifePending.delete(playerId);
    this.changes.set(new Map(this.lifePending));
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.lifePending.clear();
      this.changes.set(EMPTY_LIFE_CHANGE);
    }, LIFE_FLASH_MS);
  }

  clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.lifePending.clear();
    this.changes.set(EMPTY_LIFE_CHANGE);
  }
}
