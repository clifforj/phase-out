import { signal } from '@angular/core';
import type { Router } from '@angular/router';
import type { GameStore } from '../core/game-store';

export class ConcedeFlow {
  readonly confirming = signal(false);
  private leaveAfter = false;

  constructor(
    private readonly store: Pick<GameStore, 'role' | 'mySeat' | 'watchState' | 'concede'>,
    private readonly router: Pick<Router, 'navigateByUrl'>,
  ) {}

  request(): void {
    this.confirming.set(true);
  }

  leaveTable(): void {
    const mustConcede =
      this.store.role() === 'player' &&
      !this.store.mySeat()?.hasLeft &&
      this.store.watchState() !== 'over';
    if (mustConcede) {
      this.leaveAfter = true;
      this.confirming.set(true);
      return;
    }
    this.router.navigateByUrl('/');
  }

  confirm(): void {
    this.confirming.set(false);
    this.store.concede();
    if (this.leaveAfter) {
      this.leaveAfter = false;
      this.router.navigateByUrl('/');
    }
  }

  cancel(): void {
    this.confirming.set(false);
    this.leaveAfter = false;
  }
}
