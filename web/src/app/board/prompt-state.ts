import { type Signal, computed } from '@angular/core';
import type { GameStore } from '../core/game-store';
import {
  actionableIds,
  boardTargetCards,
  cardChoicePrompt,
  chosenIds,
  clickActionType,
  zoneTargetsFor,
} from '../rules/prompt-actions';
import { triggerOrderPrompt } from '../rules/trigger-order';
import type { Seat } from './scene/seat-metrics';

export const EMPTY_IDS: Set<string> = new Set();

export class PromptState {
  constructor(
    private readonly store: GameStore,
    private readonly seats: Signal<Seat[]>,
  ) {}

  readonly actionable = computed(() =>
    actionableIds(this.store.decision(), this.store.playableIds(), this.store.snapshot()),
  );
  readonly chosen = computed(() => chosenIds(this.store.decision()));

  readonly playableHighlight = computed(() =>
    this.store.decision() ? this.store.playableIds() : EMPTY_IDS,
  );

  readonly cardChoice = computed(() => cardChoicePrompt(this.store.decision()));
  readonly triggerOrder = computed(() => triggerOrderPrompt(this.store.decision()));
  readonly targetListCards = computed(() =>
    boardTargetCards(this.store.decision(), this.store.snapshot()),
  );
  readonly choiceListChoices = computed(() => {
    const prompt = this.store.decision();
    return prompt?.kind === 'GAME_CHOOSE_CHOICE' ? prompt.choices : [];
  });

  readonly zoneTargetGroups = computed(() => zoneTargetsFor(this.store.decision(), this.seats()));
  readonly payingMana = computed(
    () => this.store.role() === 'player' && this.store.decision()?.kind === 'GAME_PLAY_MANA',
  );

  actOn(objectId: string): boolean {
    if (this.store.role() !== 'player') return false;
    const prompt = this.store.decision();
    if (!prompt || !this.actionable().has(objectId)) return false;
    const action = clickActionType(prompt);
    if (action === 'activate') this.store.activate(objectId);
    else if (action === 'chooseTarget') this.store.chooseTarget(objectId);
    else return false;
    return true;
  }

  targetPlayer(playerId: string): boolean {
    if (
      this.store.role() !== 'player' ||
      !this.store.decision() ||
      !this.actionable().has(playerId)
    )
      return false;
    this.store.chooseTarget(playerId);
    return true;
  }

  chooseFromList(key: string): void {
    this.store.chooseValue(key);
    this.store.choiceListOpen.set(false);
  }
}
