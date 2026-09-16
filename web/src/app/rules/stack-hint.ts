import { type LogLine, withoutTags } from '../core/game-log';
import type { CardView } from '../core/protocol';
import { stripTags } from './text-format';

export interface StackHint {
  headline: string;

  detail: string;
}

const LOG_WINDOW = 60;

const ABILITY_PHRASES = ['ability triggers', 'activates', 'triggered ability', 'activated ability'];

const ABILITY = 'Ability';

const RULES_FRAGMENT = 24;
const MIN_FRAGMENT = 8;

const CAST_VERBS = ['casts', 'plays'];

export function stackHint(card: CardView, log: readonly LogLine[]): StackHint | null {
  const name = card.displayName || card.name;
  const rules = withoutTags(
    card.rules
      .map((rule) => stripTags(rule, card.name))
      .filter(Boolean)
      .join(' '),
  );
  const recent = log
    .slice(-LOG_WINDOW)
    .filter((line) => line.kind === 'GAME')
    .map((line) => withoutTags(line.text));

  const isAbility = !name || name === ABILITY;

  const effectFragment = effectText(rules).slice(0, RULES_FRAGMENT).toLowerCase();
  const startFragment = rules.slice(0, RULES_FRAGMENT).toLowerCase();
  const line = isAbility
    ? ((effectFragment.length >= MIN_FRAGMENT
        ? findLast(recent, (text) => text.includes(effectFragment))
        : null) ??
      (startFragment !== effectFragment && startFragment.length >= MIN_FRAGMENT
        ? findLast(recent, (text) => text.includes(startFragment))
        : null) ??
      findLast(recent, (text) => ABILITY_PHRASES.some((phrase) => text.includes(phrase))))
    : findLast(recent, (text) => castAnnouncement(name).test(text));

  if (!line) return null;

  const parts = line.split(' - ');
  const headline = isAbility && parts.length >= 3 ? parts.slice(0, 2).join(' - ') : line;
  const triggerDetail = isAbility && parts.length >= 3 ? parts.slice(2).join(' - ').trim() : '';

  return {
    headline,
    detail:
      triggerDetail || card.typeLine?.trim() || (rules && !repeatsRules(line, rules) ? rules : ''),
  };
}

function repeatsRules(line: string, rules: string): boolean {
  const effect = effectText(rules);
  if (effect.length < MIN_FRAGMENT) return false;
  return normalizeForCompare(line).includes(normalizeForCompare(effect));
}

function effectText(rules: string): string {
  return rules.slice(rules.indexOf(':') + 1).trim();
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[{}]/g, '')
    .replace(/[.,;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function beingCast(card: CardView, log: readonly LogLine[]): boolean {
  return stackHint(card, log) === null;
}

export function castAnnouncement(name: string): RegExp {
  const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:${CAST_VERBS.join('|')})\\s+${escaped}\\b`);
}

function findLast(
  lines: readonly string[],
  match: (lowercaseText: string) => boolean,
): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (match(lines[i].toLowerCase())) return lines[i];
  }
  return null;
}
