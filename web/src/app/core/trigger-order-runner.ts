import { Signal, signal } from '@angular/core';
import { triggerOrderPrompt, triggerPickSequence } from '../rules/trigger-order';
import { PromptView } from './protocol';

export interface TriggerOrderDeps {
  prompt: Signal<PromptView | null>;
  chooseTarget: (targetId: string) => void;
  clearPrompt: () => void;
}

export class TriggerOrderRunner {
  readonly orderingTriggers = signal(false);

  private queue: string[] = [];

  constructor(private readonly deps: TriggerOrderDeps) {}

  order(resolutionOrder: readonly string[]): void {
    const prompt = triggerOrderPrompt(this.deps.prompt());
    if (!prompt) return;
    const offered = new Set(prompt.cards.map((card) => card.objectId));
    const chosen = new Set(resolutionOrder);
    if (chosen.size !== offered.size || [...chosen].some((id) => !offered.has(id))) return;

    this.queue = triggerPickSequence(resolutionOrder);
    this.orderingTriggers.set(true);
    this.step();
  }

  step(): void {
    if (!this.orderingTriggers()) return;
    const next = this.queue[0];
    const prompt = triggerOrderPrompt(this.deps.prompt());
    if (!next || !prompt || !prompt.selectableTargets.includes(next)) {
      this.stop();
      return;
    }
    this.queue = this.queue.slice(1);
    this.deps.chooseTarget(next);
    this.deps.clearPrompt();
  }

  stop(): void {
    this.queue = [];
    this.orderingTriggers.set(false);
  }
}
