import { COLOR_HEX } from '../../rules/text-format';
import type { CardView } from '../../core/protocol';

export const THEME = {
  background: 0x06080c,

  tableEdge: 0x0a0810,

  tableLine: 0x241f36,

  accent: 0x22d3ee,

  commander: 0xd9b45c,

  playable: 0x86c98b,

  actionable: 0xf4efe3,

  chosen: 0xd9b45c,

  danger: 0xd4685a,
  blocker: 0x8f7fd0,

  zoneLine: 0x6d6480,
  zonePlate: 0x0a0712,

  tableGlow: 0x8a6aee,
} as const;

export const FELT = ['#2c2448', '#1c1730', '#100d1f', '#07070c'] as const;

export const FELT_RINGS = {
  stack: 'rgba(34, 211, 238, 0.2)',
  boundary: 'rgba(36, 31, 54, 0.9)',
} as const;

export const FOCUS_RING_GLOW = {
  outer: [
    [0, 'rgba(34, 211, 238, 0.5)'],
    [0.25, 'rgba(111, 147, 224, 0.5)'],
    [0.5, 'rgba(34, 211, 238, 0.5)'],
    [0.75, 'rgba(111, 147, 224, 0.5)'],
    [1, 'rgba(34, 211, 238, 0.5)'],
  ],
  inner: [
    [0, 'rgba(111, 147, 224, 0.5)'],
    [0.25, 'rgba(34, 211, 238, 0.5)'],
    [0.5, 'rgba(111, 147, 224, 0.5)'],
    [0.75, 'rgba(34, 211, 238, 0.5)'],
    [1, 'rgba(111, 147, 224, 0.5)'],
  ],
} as const;

export const FOCUS_RING_BAND = { inner: 0.25, peak: 0.6, outer: 1, coreHalfWidth: 0.18 } as const;

export const TABLE_AURORA = {
  outer: [
    [0, 'rgba(143, 111, 224, 0.28)'],
    [0.25, 'rgba(143, 111, 224, 0)'],
    [0.5, 'rgba(224, 161, 92, 0.25)'],
    [0.75, 'rgba(224, 161, 92, 0)'],
    [1, 'rgba(143, 111, 224, 0.28)'],
  ],
  inner: [
    [0, 'rgba(111, 147, 224, 0)'],
    [0.3, 'rgba(111, 147, 224, 0.2)'],
    [0.6, 'rgba(111, 147, 224, 0)'],
    [1, 'rgba(111, 147, 224, 0)'],
  ],
} as const;

export const FRAME_COLOR = COLOR_HEX;

export const CARD_INK = {
  base: '#1e1b17',
  text: '#f2ede5',
  muted: '#b3aa9e',
  rules: '#ded7cc',
  line: 'rgba(0, 0, 0, 0.45)',
  back: '#241f33',
  backPattern: '#332b47',
} as const;

export function frameColorsOf(card: CardView): string[] {
  const letters = card.frameColor ? [...card.frameColor] : card.colors;
  return letters.map((letter) => FRAME_COLOR[letter]).filter(Boolean);
}
