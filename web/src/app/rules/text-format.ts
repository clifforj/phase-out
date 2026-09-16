import type { CardView } from '../core/protocol';

export const COLOR_HEX: Record<string, string> = {
  W: '#d9d2b0',
  U: '#4f88ad',
  B: '#3b3542',
  R: '#a8543f',
  G: '#4e7a55',
};

export function frameTint(card: CardView): string {
  const letters = (card.frameColor ? [...card.frameColor] : card.colors).filter(
    (c) => COLOR_HEX[c],
  );
  if (!letters.length) return '';
  const stops = letters.map(
    (letter) => `color-mix(in srgb, ${COLOR_HEX[letter]} 55%, var(--panel))`,
  );
  if (stops.length === 1) return stops[0];
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  bull: '•',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  aelig: 'æ',
  Aelig: 'Æ',
  ouml: 'ö',
  auml: 'ä',
  uuml: 'ü',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);?/g, (match, name) => HTML_ENTITIES[name] ?? match);
}

export function stripTags(text: string, sourceName?: string): string {
  return decodeEntities(text)
    .replace(/<br\s*\/?>/gi, ' ')

    .replace(/<\/?div[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\{this\}/g, sourceName || 'this')

    .replace(/\s*\[[a-z0-9]{2,5}\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
