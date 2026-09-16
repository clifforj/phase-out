import type { CardView } from '../../core/protocol';
import { stripTags } from '../../rules/text-format';
import { roundedRectPath } from './canvas';
import { paintManaGlyph } from './paint-mana-font';

export type EmblemId =
  | 'flying'
  | 'menace'
  | 'unblockable'
  | 'trample'
  | 'doubleStrike'
  | 'firstStrike'
  | 'deathtouch'
  | 'vigilance'
  | 'hexproof'
  | 'shroud'
  | 'protection'
  | 'indestructible'
  | 'lifelink'
  | 'haste'
  | 'reach'
  | 'defender'
  | 'infect';

const EMBLEMS: readonly EmblemId[] = [
  'flying',
  'menace',
  'unblockable',
  'trample',
  'doubleStrike',
  'firstStrike',
  'deathtouch',
  'vigilance',
  'hexproof',
  'shroud',
  'protection',
  'indestructible',
  'lifelink',
  'haste',
  'reach',
  'defender',
  'infect',
];

const ICON_EMBLEMS: Record<string, EmblemId> = {
  ABILITY_FLYING: 'flying',
  ABILITY_REACH: 'reach',
  ABILITY_TRAMPLE: 'trample',
  ABILITY_FIRST_STRIKE: 'firstStrike',
  ABILITY_DOUBLE_STRIKE: 'doubleStrike',
  ABILITY_DEATHTOUCH: 'deathtouch',
  ABILITY_LIFELINK: 'lifelink',
  ABILITY_VIGILANCE: 'vigilance',
  ABILITY_HEXPROOF: 'hexproof',
  ABILITY_INDESTRUCTIBLE: 'indestructible',
  ABILITY_DEFENDER: 'defender',
  ABILITY_INFECT: 'infect',
};

const KEYWORD_EMBLEMS: readonly (readonly [string, EmblemId])[] = [
  ['menace', 'menace'],
  ['haste', 'haste'],
  ['shroud', 'shroud'],
];

export const MAX_EMBLEMS = 6;

export function emblemsFor(card: CardView): EmblemId[] {
  if (card.faceDown) return [];
  const found = new Set<EmblemId>();
  for (const icon of card.icons) {
    const emblem = ICON_EMBLEMS[icon.type];
    if (emblem) found.add(emblem);
  }
  for (const emblem of keywordEmblems(card)) found.add(emblem);
  if (found.has('doubleStrike')) found.delete('firstStrike');
  return EMBLEMS.filter((emblem) => found.has(emblem)).slice(0, MAX_EMBLEMS);
}

function keywordEmblems(card: CardView): EmblemId[] {
  const clauses = card.rules
    .flatMap((line) => stripTags(line, card.name).split(/[,.;]/))
    .map((clause) => clause.trim().toLowerCase())
    .filter(Boolean);

  const found = KEYWORD_EMBLEMS.filter(([keyword]) =>
    clauses.some((clause) => clause === keyword || clause.startsWith(`${keyword} (`)),
  ).map(([, emblem]) => emblem);

  if (clauses.some((clause) => clause.startsWith('protection from'))) found.push('protection');

  const name = card.name.toLowerCase();
  if (
    clauses.some(
      (clause) => clause === `${name} can't be blocked` || clause === "this can't be blocked",
    )
  ) {
    found.push('unblockable');
  }

  return found;
}

const CHIP = 'rgba(6, 5, 4, 0.86)';
const INK = '#f2ede5';

const EMBLEM_GLYPHS: Record<EmblemId, string> = {
  flying: '',
  menace: '',
  unblockable: '',
  trample: '',
  doubleStrike: '',
  firstStrike: '',
  deathtouch: '',
  vigilance: '',
  hexproof: '',
  shroud: '',
  protection: '',
  indestructible: '',
  lifelink: '',
  haste: '',
  reach: '',
  defender: '',
  infect: '',
};

export function paintEmblem(
  ctx: CanvasRenderingContext2D,
  emblem: EmblemId,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.fillStyle = CHIP;
  roundedRectPath(ctx, x, y, size, size, size * 0.28);
  ctx.fill();
  ctx.restore();

  paintManaGlyph(ctx, EMBLEM_GLYPHS[emblem], x + size / 2, y + size / 2, size * 0.64, INK);
}
