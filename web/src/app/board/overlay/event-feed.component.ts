import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  CircleCheck,
  Flag,
  Heart,
  RotateCw,
  Skull,
  Swords,
  Wand2,
  Zap,
  type IconNode,
} from 'lucide';
import type { GameEvent, GameEventKind } from '../../rules/game-events';
import { ManaTextComponent } from '../../ui/mana-symbol.component';
import { IconComponent } from '../../ui/icon.component';

export const EVENT_DWELL_MS = 9_000;

export const EVENT_FADE_MS = 500;
export const EVENT_FEED_MAX = 4;

const GLYPH: Record<GameEventKind, IconNode | null> = {
  ending: Flag,
  removal: Skull,
  damage: Zap,
  life: Heart,
  trigger: RotateCw,
  combat: Swords,
  cast: Wand2,
  resolve: CircleCheck,
  other: null,
};

@Component({
  selector: 'app-event-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaTextComponent, IconComponent],
  host: {
    role: 'log',
    'aria-live': 'polite',
    'aria-label': 'What just happened',
    '[class.held]': 'held()',
    '(pointerenter)': 'hold(true)',
    '(pointerleave)': 'hold(false)',
    '(focusin)': 'hold(true)',
    '(focusout)': 'hold(false)',
  },
  templateUrl: './event-feed.component.html',
  styleUrl: './event-feed.component.css',
})
export class EventFeedComponent {
  readonly events = input.required<readonly GameEvent[]>();

  readonly pick = output<GameEvent>();

  protected readonly held = signal(false);

  private readonly live = signal<readonly number[]>([]);

  private seen = -1;

  private primed = false;
  private readonly due = new Map<number, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heldAt = 0;

  protected readonly shown = computed(() => {
    const byId = new Map(this.events().map((event) => [event.id, event]));
    return this.live()
      .map((id) => byId.get(id))
      .filter((event): event is GameEvent => event !== undefined);
  });

  constructor() {
    effect(() => {
      const events = this.events();
      if (!this.primed) {
        this.primed = true;
        this.seen = events.length ? events[events.length - 1].id : -1;
        return;
      }
      if (!events.length) {
        this.clear();
        return;
      }
      const fresh = events.filter((event) => event.id > this.seen);
      if (!fresh.length) return;
      this.seen = events[events.length - 1].id;
      const arriving = fresh
        .map((event) => event.id)
        .reverse()
        .slice(0, EVENT_FEED_MAX);
      const now = Date.now();
      for (const id of arriving) this.due.set(id, now + EVENT_DWELL_MS + EVENT_FADE_MS);
      this.live.update((live) => {
        const next = [...arriving, ...live].slice(0, EVENT_FEED_MAX);
        for (const id of live) if (!next.includes(id)) this.due.delete(id);
        return next;
      });
      this.schedule();
    });

    inject(DestroyRef).onDestroy(() => this.clear());
  }

  protected glyph(kind: GameEventKind): IconNode | null {
    return GLYPH[kind];
  }

  protected hold(held: boolean): void {
    if (held === this.held()) return;
    this.held.set(held);
    if (held) {
      this.heldAt = Date.now();
      this.stopTimer();
      return;
    }
    const paused = Date.now() - this.heldAt;
    for (const [id, at] of this.due) this.due.set(id, at + paused);
    this.schedule();
  }

  private sweep(): void {
    this.timer = null;
    const now = Date.now();
    const expired = [...this.due].filter(([, at]) => at <= now).map(([id]) => id);
    if (expired.length) {
      for (const id of expired) this.due.delete(id);
      this.live.update((live) => live.filter((id) => !expired.includes(id)));
    }
    this.schedule();
  }

  private schedule(): void {
    this.stopTimer();
    if (this.held() || !this.due.size) return;
    const next = Math.min(...this.due.values());
    this.timer = setTimeout(() => this.sweep(), Math.max(0, next - Date.now()));
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private clear(): void {
    this.stopTimer();
    this.due.clear();
    if (this.live().length) this.live.set([]);
  }
}
