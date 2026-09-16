import { Signal, computed, signal } from '@angular/core';
import { promptContext } from '../rules/prompt-actions';
import { GameRole, GameStateView, PromptView } from './protocol';

export const AUTO_PASS_UNCHANGED_MS = 300;
export const AUTO_PASS_GLANCE_MS = 2_500;

export interface AutoPassDeps {
  prompt: Signal<PromptView | null>;
  snapshot: Signal<GameStateView | null>;
  role: Signal<GameRole | null>;
  passPriority: () => void;
}

export class AutoPassScheduler {
  readonly autoPassMs = signal<number | null>(null);

  readonly autoPassing = computed(() => this.autoPassMs() !== null);

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: AutoPassDeps) {}

  schedule(previousStackIds: readonly string[], consequential: boolean): void {
    this.clear();
    if (this.deps.role() !== 'player') return;
    const prompt = this.deps.prompt();
    const game = this.deps.snapshot();
    if (!prompt || !game) return;
    if (promptContext(prompt) !== 'priority') return;
    if (this.isActionable(game)) return;

    const stackIds = game.stack.map((c) => c.objectId);
    const stackChanged =
      stackIds.length > 0 &&
      (stackIds.length !== previousStackIds.length ||
        stackIds.some((id, i) => id !== previousStackIds[i]));
    const delay = stackChanged || consequential ? AUTO_PASS_GLANCE_MS : AUTO_PASS_UNCHANGED_MS;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.autoPassMs.set(null);
      this.deps.passPriority();
    }, delay);

    this.autoPassMs.set(delay);
  }

  clear(): void {
    this.autoPassMs.set(null);
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private isActionable(game: GameStateView): boolean {
    const battlefieldIds = new Set<string>();
    const planeswalkerIds = new Set<string>();
    for (const player of game.players) {
      for (const permanent of player.battlefield) {
        battlefieldIds.add(permanent.card.objectId);
        if (permanent.card.typeLine?.includes('Planeswalker')) {
          planeswalkerIds.add(permanent.card.objectId);
        }
      }
    }
    return game.playable.some(
      (p) =>
        !battlefieldIds.has(p.objectId) ||
        p.playableImportantCount > 0 ||
        planeswalkerIds.has(p.objectId),
    );
  }
}
