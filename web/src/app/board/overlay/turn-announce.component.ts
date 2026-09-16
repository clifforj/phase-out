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
import { announcementFor, type Announcement, type TurnSignal } from '../../rules/announcements';

export const PHASE_SETTLE_MS = 500;
export const TURN_DWELL_MS = 2_600;
export const PHASE_DWELL_MS = 1_400;

@Component({
  selector: 'app-turn-announce',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './turn-announce.component.html',
  styleUrl: './turn-announce.component.css',
})
export class TurnAnnounceComponent {
  readonly turn = input.required<number>();
  readonly activePlayerId = input<string | null>(null);
  readonly activeName = input<string | null>(null);
  readonly activeIsMe = input(false);
  readonly phase = input<string | null>(null);

  protected readonly shown = signal<Announcement | null>(null);

  private readonly frame = computed<TurnSignal>(() => ({
    turn: this.turn(),
    activePlayerId: this.activePlayerId(),
    activeName: this.activeName(),
    activeIsMe: this.activeIsMe(),
    phase: this.phase(),
  }));

  private previous: TurnSignal | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private dwellTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const next = this.frame();
      const announcement = announcementFor(this.previous, next);
      this.previous = next;
      if (announcement) this.raise(announcement);
    });
    inject(DestroyRef).onDestroy(() => this.clearTimers());
  }

  private raise(announcement: Announcement): void {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = null;

    if (announcement.kind === 'phase') {
      if (this.shown()?.kind === 'turn') return;
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null;
        this.show(announcement, PHASE_DWELL_MS);
      }, PHASE_SETTLE_MS);
      return;
    }
    this.show(announcement, TURN_DWELL_MS);
  }

  private show(announcement: Announcement, dwell: number): void {
    if (this.dwellTimer !== null) clearTimeout(this.dwellTimer);
    this.shown.set(announcement);
    this.dwellTimer = setTimeout(() => {
      this.dwellTimer = null;
      this.shown.set(null);
    }, dwell);
  }

  private clearTimers(): void {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    if (this.dwellTimer !== null) clearTimeout(this.dwellTimer);
    this.settleTimer = null;
    this.dwellTimer = null;
  }
}
