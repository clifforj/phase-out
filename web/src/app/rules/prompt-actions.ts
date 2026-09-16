import type { CardView, GameStateView, PromptView } from '../core/protocol';
import type { SeatRef, ZoneKind, ZoneRef } from './zones';
import { triggerOrderPrompt } from './trigger-order';

export type PromptContext = 'priority' | 'declare-attackers' | 'declare-blockers' | 'other';

export function promptContext(prompt: PromptView | null): PromptContext {
  if (!prompt || prompt.kind !== 'GAME_SELECT') return 'other';
  if (prompt.combatStep === 'DECLARE_ATTACKERS') return 'declare-attackers';
  if (prompt.combatStep === 'DECLARE_BLOCKERS') return 'declare-blockers';
  if (prompt.combatStep) return 'priority';
  if (prompt.possibleAttackers.length) return 'declare-attackers';
  if (prompt.possibleBlockers.length) return 'declare-blockers';
  return 'priority';
}

export interface DeclaredCombatant {
  id: string;

  label: string;

  against: string;
}

export function declaredCombatants(
  context: PromptContext,
  game: GameStateView | null,
): DeclaredCombatant[] {
  const role =
    context === 'declare-attackers'
      ? 'attackers'
      : context === 'declare-blockers'
        ? 'blockers'
        : null;
  if (!role || !game) return [];
  const me = game.players.find((player) => player.isMe);
  if (!me) return [];
  const mine = new Set(me.battlefield.map((permanent) => permanent.card.objectId));

  const declared: DeclaredCombatant[] = [];
  for (const group of game.combat) {
    const against =
      role === 'attackers'
        ? (group.defenderName ?? 'nothing yet')
        : group.attackers.map(cardLabel).join(' and ') || 'nothing yet';
    for (const card of group[role]) {
      if (!mine.has(card.objectId)) continue;
      declared.push({ id: card.objectId, label: cardLabel(card), against });
    }
  }
  return declared;
}

function cardLabel(card: CardView): string {
  return card.displayName || card.name;
}

export function actionableIds(
  prompt: PromptView | null,
  playableIds: ReadonlySet<string>,
  game: GameStateView | null = null,
): Set<string> {
  if (!prompt) return new Set();
  switch (prompt.kind) {
    case 'GAME_SELECT': {
      const declared = declaredCombatants(promptContext(prompt), game).map((one) => one.id);
      return new Set([
        ...playableIds,
        ...prompt.possibleAttackers,
        ...prompt.possibleBlockers,
        ...declared,
      ]);
    }
    case 'GAME_PLAY_MANA':
      return new Set(playableIds);
    case 'GAME_TARGET':
      return new Set(prompt.selectableTargets);
    default:
      return new Set();
  }
}

export function chosenIds(prompt: PromptView | null): Set<string> {
  if (!prompt || prompt.kind !== 'GAME_TARGET') return new Set();
  return new Set(prompt.chosenTargets);
}

export function clickActionType(prompt: PromptView | null): 'activate' | 'chooseTarget' | null {
  if (!prompt) return null;
  if (prompt.kind === 'GAME_TARGET') return 'chooseTarget';
  if (prompt.kind === 'GAME_SELECT' || prompt.kind === 'GAME_PLAY_MANA') return 'activate';
  return null;
}

const BOARD_BROWSABLE_TARGET_ZONES = new Set(['GRAVEYARD', 'exile zone']);

export function cardChoicePrompt(prompt: PromptView | null): PromptView | null {
  if (!prompt || prompt.kind !== 'GAME_TARGET' || !prompt.cards.length) return null;
  if (prompt.targetZone && BOARD_BROWSABLE_TARGET_ZONES.has(prompt.targetZone)) return null;
  if (triggerOrderPrompt(prompt)) return null;
  return prompt;
}

export interface BoardTarget {
  id: string;

  label: string;

  detail: string;

  chosen: boolean;
}

export function boardTargets(prompt: PromptView | null, game: GameStateView | null): BoardTarget[] {
  if (!prompt || prompt.kind !== 'GAME_TARGET' || !prompt.selectableTargets.length || !game)
    return [];
  const wanted = new Set(prompt.selectableTargets);
  const chosen = new Set(prompt.chosenTargets);
  const permanents: BoardTarget[] = [];
  const players: BoardTarget[] = [];

  for (const player of game.players) {
    const owner = player.isMe ? 'your' : `${player.name}'s`;
    for (const permanent of player.battlefield) {
      const card = permanent.card;
      if (!wanted.has(card.objectId)) continue;
      permanents.push({
        id: card.objectId,
        label: card.displayName || card.name,
        detail: `${owner} ${permanentNoun(card.typeLine)}`,
        chosen: chosen.has(card.objectId),
      });
    }
    if (wanted.has(player.playerId)) {
      players.push({
        id: player.playerId,
        label: player.name,
        detail: player.isMe ? 'you' : 'player',
        chosen: chosen.has(player.playerId),
      });
    }
  }

  return [...permanents, ...players];
}

export const TARGET_LIST_THRESHOLD = 8;

export function boardTargetCards(
  prompt: PromptView | null,
  game: GameStateView | null,
): CardView[] {
  if (!prompt || prompt.kind !== 'GAME_TARGET' || !prompt.selectableTargets.length || !game)
    return [];
  const wanted = new Set(prompt.selectableTargets);
  const cards: CardView[] = [];
  for (const player of game.players) {
    for (const permanent of player.battlefield) {
      if (wanted.has(permanent.card.objectId)) cards.push(permanent.card);
    }
  }
  return cards;
}

function permanentNoun(typeLine: string | undefined): string {
  const line = typeLine ?? '';
  if (/planeswalker/i.test(line)) return 'planeswalker';
  if (/battle/i.test(line)) return 'battle';
  if (/creature/i.test(line)) return 'creature';
  if (/land/i.test(line)) return 'land';
  return 'permanent';
}

export interface ZoneTargetGroup extends ZoneRef {
  targets: string[];
}

export function zoneTargetsFor(
  prompt: PromptView | null,
  seats: readonly SeatRef[],
): ZoneTargetGroup[] {
  if (!prompt || prompt.kind !== 'GAME_TARGET' || !prompt.selectableTargets.length) return [];
  const wanted = new Set(prompt.selectableTargets);
  const groups: ZoneTargetGroup[] = [];
  for (const seat of seats) {
    for (const kind of ['graveyard', 'exile'] as const satisfies readonly ZoneKind[]) {
      const targets = seat.player[kind].map((card) => card.objectId).filter((id) => wanted.has(id));
      if (targets.length) groups.push({ seat: seat.index, kind, targets });
    }
  }
  return groups;
}

export function hasBoardReachableTarget(
  prompt: PromptView | null,
  game: GameStateView | null,
): boolean {
  if (!prompt || prompt.kind !== 'GAME_TARGET' || !prompt.selectableTargets.length || !game)
    return false;
  const wanted = new Set(prompt.selectableTargets);
  const isWanted = (card: CardView) => wanted.has(card.objectId);
  if (game.stack.some(isWanted) || game.myHand.some(isWanted)) return true;
  return game.players.some(
    (player) =>
      wanted.has(player.playerId) ||
      player.battlefield.some((permanent) => isWanted(permanent.card)),
  );
}

export function zoneTargetCount(prompt: PromptView | null, game: GameStateView | null): number {
  if (!prompt || prompt.kind !== 'GAME_TARGET' || !prompt.selectableTargets.length || !game)
    return 0;
  const wanted = new Set(prompt.selectableTargets);
  let count = 0;
  for (const player of game.players) {
    for (const card of [...player.graveyard, ...player.exile]) {
      if (wanted.has(card.objectId)) count += 1;
    }
  }
  return count;
}
