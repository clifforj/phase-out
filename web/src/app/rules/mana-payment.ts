import type { GameStateView, ManaPoolStateView, ManaType, PromptView } from '../core/protocol';
import { stripTags } from './text-format';

export type ManaLetter = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

const LETTERS: readonly ManaLetter[] = ['W', 'U', 'B', 'R', 'G', 'C'];

const COLORS: readonly ManaLetter[] = ['W', 'U', 'B', 'R', 'G'];

const MANA_TYPES: Record<ManaLetter, ManaType> = {
  W: 'WHITE',
  U: 'BLUE',
  B: 'BLACK',
  R: 'RED',
  G: 'GREEN',
  C: 'COLORLESS',
};

const POOL_KEYS: Record<ManaLetter, keyof ManaPoolStateView> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
  C: 'colorless',
};

const LETTER_NAMES: Record<ManaLetter, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
  C: 'colourless',
};

export interface ManaNeed {
  raw: string;

  letters: readonly ManaLetter[];

  count: number;
}

export interface ManaSource {
  objectId: string;
  name: string;

  letters: readonly ManaLetter[];

  basic: boolean;

  creature: boolean;

  lifeCost: boolean;
}

export type PaymentStep =
  | { kind: 'pool'; manaType: ManaType; letter: ManaLetter; label: string }
  | { kind: 'tap'; objectId: string; letter: ManaLetter; label: string };

export function stepKey(step: PaymentStep): string {
  return step.kind === 'pool' ? `pool:${step.manaType}` : `tap:${step.objectId}`;
}

export function unpaidManaCostText(prompt: PromptView | null): string {
  if (!prompt || prompt.kind !== 'GAME_PLAY_MANA' || !prompt.message) return '';
  return prompt.message
    .split('<')[0]
    .replace(/^\s*pay\s*/i, '')
    .trim();
}

export function unpaidManaCost(prompt: PromptView | null): ManaNeed[] | null {
  const text = unpaidManaCostText(prompt);
  if (!text) return null;

  const needs: ManaNeed[] = [];
  let matched = '';
  for (const match of text.matchAll(/\{([^}]*)\}/g)) {
    const need = manaNeed(match[1]);
    if (!need) return null;
    needs.push(need);
    matched += match[0];
  }
  if (!needs.length || matched !== text) return null;
  return needs;
}

function manaNeed(token: string): ManaNeed | null {
  const key = token.trim().toUpperCase();
  if (/^\d+$/.test(key)) {
    const count = Number(key);
    return count > 0 ? { raw: key, letters: [], count } : null;
  }
  if (isLetter(key)) return { raw: key, letters: [key], count: 1 };

  const hybrid = /^([WUBRGC])\/([WUBRGC])$/.exec(key);
  if (hybrid)
    return { raw: key, letters: [hybrid[1] as ManaLetter, hybrid[2] as ManaLetter], count: 1 };

  const monoHybrid = /^\d+\/([WUBRGC])$/.exec(key);
  if (monoHybrid) return { raw: key, letters: [monoHybrid[1] as ManaLetter], count: 1 };

  const phyrexian = /^(?:([WUBRGC])\/P|P\/([WUBRGC]))$/.exec(key);
  if (phyrexian)
    return { raw: key, letters: [(phyrexian[1] ?? phyrexian[2]) as ManaLetter], count: 1 };

  return null;
}

function pays(need: ManaNeed, letter: ManaLetter): boolean {
  return need.letters.length === 0 || need.letters.includes(letter);
}

export function manaSources(game: GameStateView | null): ManaSource[] {
  const me = game?.players.find((player) => player.isMe);
  if (!game || !me) return [];
  const playable = new Map(game.playable.map((entry) => [entry.objectId, entry]));
  const identity = commanderIdentity(game);

  const sources: ManaSource[] = [];
  for (const permanent of me.battlefield) {
    if (permanent.tapped) continue;
    const entry = playable.get(permanent.card.objectId);
    if (!entry) continue;

    const letters = new Set<ManaLetter>();
    let lifeCost = false;
    for (const text of entry.abilityTexts) {
      const full = abilityText(text, permanent.card.rules);
      const produced = producedMana(full, identity);
      if (!produced) continue;
      for (const letter of produced) letters.add(letter);
      if (costsLife(full)) lifeCost = true;
    }
    if (!letters.size) continue;

    sources.push({
      objectId: permanent.card.objectId,
      name: permanent.card.displayName || permanent.card.name,
      letters: LETTERS.filter((letter) => letters.has(letter)),
      basic: /basic land/i.test(permanent.card.typeLine ?? ''),
      creature: /creature/i.test(permanent.card.typeLine ?? ''),
      lifeCost,
    });
  }
  return sources;
}

function abilityText(text: string, rules: readonly string[]): string {
  const plain = stripTags(text);
  if (!plain.endsWith('...')) return plain;
  const prefix = plain.slice(0, -3);
  return rules.map((rule) => stripTags(rule)).find((rule) => rule.startsWith(prefix)) ?? plain;
}

export function commanderIdentity(game: GameStateView | null): ManaLetter[] {
  const me = game?.players.find((player) => player.isMe);
  if (!me) return [];
  const letters = new Set<string>();
  for (const entry of me.commandZone) {
    for (const color of entry.card?.colors ?? []) letters.add(color);
  }
  for (const permanent of me.battlefield) {
    if (!permanent.card.icons.some((icon) => icon.type === 'COMMANDER')) continue;
    for (const color of permanent.card.colors) letters.add(color);
  }
  return COLORS.filter((letter) => letters.has(letter));
}

function isManaCostSegment(segment: string): boolean {
  const bracket = /^\{([^{}]*)\}$/.exec(segment.trim());
  if (!bracket) return false;
  const inner = bracket[1].toUpperCase();
  return /^\d+$/.test(inner) || isLetter(inner) || /^[WUBRGC]\/[WUBRGC]$/.test(inner);
}

export function producedMana(
  text: string,
  identity: readonly ManaLetter[] = [],
): ManaLetter[] | null {
  const match = /^([^:]+):\s*Add\s+([^.]+?)\s*(?:\.|$)/i.exec(text.trim());
  if (!match) return null;
  const [, costPart, added] = match;

  const tokens = costPart.split(',').map((token) => token.trim());
  const tapTokens = tokens.filter((token) => /^\{T\}$/i.test(token));
  const extraTokens = tokens.filter((token) => !/^\{T\}$/i.test(token));
  if (tapTokens.length !== 1 || extraTokens.some((token) => !isManaCostSegment(token))) return null;

  if (/^one mana of any colou?r in your commander'?s colou?r identity$/i.test(added)) {
    return identity.length ? [...identity] : null;
  }
  if (/^one mana of any colou?r$/i.test(added)) return [...COLORS];
  if (/^one mana of any type$/i.test(added)) return [...LETTERS];

  if (!/^\{[WUBRGC]\}(?:(?:\s*or\s*)?\{[WUBRGC]\})*$/i.test(added)) return null;
  const letters = [...added.matchAll(/\{([WUBRGC])\}/gi)].map(
    (one) => one[1].toUpperCase() as ManaLetter,
  );
  return LETTERS.filter((letter) => letters.includes(letter));
}

function costsLife(text: string): boolean {
  return (
    /\bdeals?\s+\d+\s+damage\s+to\s+you\b/i.test(text) ||
    /\b(?:pay|lose)\s+\d+\s+life\b/i.test(text)
  );
}

interface Resource {
  step:
    | { kind: 'pool'; manaType: ManaType; letter: ManaLetter; label: string }
    | { kind: 'tap'; objectId: string; label: string };
  letters: readonly ManaLetter[];

  order: readonly number[];
}

interface Assignment {
  resource: Resource;
  letter: ManaLetter;
}

const SEARCH_BUDGET = 20_000;

export function manaPaymentPlan(
  prompt: PromptView | null,
  game: GameStateView | null,
): PaymentStep[] | null {
  const needs = unpaidManaCost(prompt);
  if (!needs) return null;

  const resources = paymentResources(game);

  const units: ManaNeed[] = [];
  for (const need of needs) {
    for (let i = 0; i < need.count; i++) units.push({ ...need, count: 1 });
  }
  units.sort((a, b) => constraint(a) - constraint(b));

  const budget = { left: SEARCH_BUDGET };
  const taken = new Set<number>();
  const chosen = assign(units, 0, resources, taken, budget);
  if (!chosen) return null;

  return chosen
    .slice()
    .sort((a, b) => a.resource.order[0] - b.resource.order[0])
    .map(({ resource, letter }) => ({ ...resource.step, letter }));
}

function constraint(need: ManaNeed): number {
  return need.letters.length === 0 ? LETTERS.length + 1 : need.letters.length;
}

function paymentResources(game: GameStateView | null): Resource[] {
  const me = game?.players.find((player) => player.isMe);
  const resources: Resource[] = [];

  if (me) {
    LETTERS.forEach((letter, index) => {
      const count = me.manaPool[POOL_KEYS[letter]];
      for (let i = 0; i < count; i++) {
        resources.push({
          step: {
            kind: 'pool',
            manaType: MANA_TYPES[letter],
            letter,
            label: `spend ${LETTER_NAMES[letter]} from your pool`,
          },
          letters: [letter],

          order: [0, letter === 'C' ? 0 : 1, index, i],
        });
      }
    });
  }

  manaSources(game).forEach((source, index) => {
    resources.push({
      step: { kind: 'tap', objectId: source.objectId, label: `tap ${source.name}` },
      letters: source.letters,

      order: [
        1,
        source.lifeCost ? 1 : 0,
        source.letters.length,
        source.creature ? 1 : 0,
        source.basic ? 0 : 1,
        index,
      ],
    });
  });

  return resources.sort(compareOrder);
}

function compareOrder(a: Resource, b: Resource): number {
  for (let i = 0; i < Math.max(a.order.length, b.order.length); i++) {
    const diff = (a.order[i] ?? 0) - (b.order[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function assign(
  units: readonly ManaNeed[],
  index: number,
  resources: readonly Resource[],
  taken: Set<number>,
  budget: { left: number },
): Assignment[] | null {
  if (index >= units.length) return [];
  if (budget.left-- <= 0) return null;

  for (let i = 0; i < resources.length; i++) {
    if (taken.has(i)) continue;

    const letter = resources[i].letters.find((one) => pays(units[index], one));
    if (!letter) continue;
    taken.add(i);
    const rest = assign(units, index + 1, resources, taken, budget);
    if (rest) return [{ resource: resources[i], letter }, ...rest];
    taken.delete(i);
    if (budget.left <= 0) return null;
  }
  return null;
}

export function manaAbilityChoice(
  prompt: PromptView | null,
  needs: readonly ManaNeed[],
  game: GameStateView | null = null,
): string | null {
  if (!prompt || prompt.kind !== 'GAME_CHOOSE_ABILITY' || !needs.length) return null;
  const identity = commanderIdentity(game);

  let best: { key: string; rank: number } | null = null;
  for (const choice of prompt.choices) {
    const letters = producedMana(stripTags(choice.label).replace(/^\d+\.\s*/, ''), identity);
    if (!letters) continue;

    const coloured = needs.some(
      (need) => need.letters.length > 0 && letters.some((letter) => pays(need, letter)),
    );
    const useful = needs.some((need) => letters.some((letter) => pays(need, letter)));
    if (!useful) continue;
    const rank = (coloured ? 0 : 1) * 100 + letters.length;
    if (!best || rank < best.rank) best = { key: choice.key, rank };
  }
  return best?.key ?? null;
}

const COLOR_CHOICES: Record<string, ManaLetter> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
};

export function manaColorChoice(
  prompt: PromptView | null,
  letter: ManaLetter | null,
): string | null {
  if (!prompt || prompt.kind !== 'GAME_CHOOSE_CHOICE' || !letter || !prompt.choices.length)
    return null;
  const options = prompt.choices.map((choice) => ({
    key: choice.key,
    letter: COLOR_CHOICES[stripTags(choice.label).trim().toLowerCase()],
  }));
  if (options.some((option) => !option.letter)) return null;
  return options.find((option) => option.letter === letter)?.key ?? null;
}

function isLetter(value: string): value is ManaLetter {
  return (LETTERS as readonly string[]).includes(value);
}
