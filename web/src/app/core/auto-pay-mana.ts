import { Signal, signal } from '@angular/core';
import {
  ManaLetter,
  ManaNeed,
  manaAbilityChoice,
  manaColorChoice,
  manaPaymentPlan,
  stepKey,
  unpaidManaCost,
  unpaidManaCostText,
} from '../rules/mana-payment';
import { GameStateView, ManaType, PromptView } from './protocol';

export const AUTO_PAY_STEP_LIMIT = 40;

export interface AutoPayDeps {
  prompt: Signal<PromptView | null>;
  snapshot: Signal<GameStateView | null>;
  chooseAbility: (abilityId: string) => void;
  chooseValue: (value: string) => void;
  payManaFromPool: (manaType: ManaType) => void;
  activate: (objectId: string) => void;
  toast: (level: 'INFO' | 'ERROR', text: string) => void;
}

export class AutoPayMana {
  readonly autoPaying = signal(false);

  private cost = '';

  private needs: ManaNeed[] = [];

  private tried = new Set<string>();
  private steps = 0;

  private letter: ManaLetter | null = null;

  constructor(private readonly deps: AutoPayDeps) {}

  start(): void {
    if (this.deps.prompt()?.kind !== 'GAME_PLAY_MANA') return;
    this.autoPaying.set(true);
    this.cost = '';
    this.tried.clear();
    this.steps = 0;
    this.letter = null;
    this.step();
  }

  step(): void {
    if (!this.autoPaying()) return;
    const prompt = this.deps.prompt();
    if (!prompt) return;

    if (prompt.kind === 'GAME_CHOOSE_ABILITY') {
      const key = manaAbilityChoice(prompt, this.needs, this.deps.snapshot());
      if (!key) {
        this.stop(
          'auto-pay stopped at an ability it could not choose between - pick one to carry on',
        );
        return;
      }
      this.deps.chooseAbility(key);
      return;
    }

    if (prompt.kind === 'GAME_CHOOSE_CHOICE') {
      const value = manaColorChoice(prompt, this.letter);
      if (!value) {
        this.stop();
        return;
      }
      this.deps.chooseValue(value);
      return;
    }

    if (prompt.kind !== 'GAME_PLAY_MANA') {
      this.stop();
      return;
    }

    const cost = unpaidManaCostText(prompt);
    if (cost !== this.cost) {
      this.cost = cost;
      this.tried.clear();
    }
    this.needs = unpaidManaCost(prompt) ?? [];

    const plan = manaPaymentPlan(prompt, this.deps.snapshot());
    const step = plan?.find((one) => !this.tried.has(stepKey(one)));
    if (!step || this.steps >= AUTO_PAY_STEP_LIMIT) {
      this.stop('auto-pay could not finish this cost - the rest is yours to pay');
      return;
    }

    this.tried.add(stepKey(step));
    this.steps += 1;
    this.letter = step.letter;
    if (step.kind === 'pool') this.deps.payManaFromPool(step.manaType);
    else this.deps.activate(step.objectId);
  }

  stop(reason?: string): void {
    if (!this.autoPaying()) return;
    this.autoPaying.set(false);
    this.cost = '';
    this.needs = [];
    this.tried.clear();
    this.steps = 0;
    this.letter = null;
    if (reason) this.deps.toast('INFO', reason);
  }
}
