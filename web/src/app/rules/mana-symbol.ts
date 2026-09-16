export interface ManaSymbol {
  raw: string;

  code: string;

  label: string;
}

export function manaSymbolSvgUrl(code: string): string {
  return `https://svgs.scryfall.io/card-symbols/${code}.svg`;
}

const COLOR_NAMES: Record<string, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
  C: 'colourless',
};

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

const HYBRID_ORDER: Record<string, string> = {
  WU: 'WU',
  UW: 'WU',
  WB: 'WB',
  BW: 'WB',
  UB: 'UB',
  BU: 'UB',
  UR: 'UR',
  RU: 'UR',
  BR: 'BR',
  RB: 'BR',
  BG: 'BG',
  GB: 'BG',
  RG: 'RG',
  GR: 'RG',
  RW: 'RW',
  WR: 'RW',
  GW: 'GW',
  WG: 'GW',
  GU: 'GU',
  UG: 'GU',
};

export function manaSymbol(token: string): ManaSymbol | null {
  const raw = token.trim();
  if (!raw) return null;
  const key = raw.toUpperCase();

  if (/^\d+$/.test(key)) {
    return { raw, code: key, label: `${NUMBER_WORDS[Number(key)] ?? key} generic mana` };
  }

  if (key === 'X' || key === 'Y' || key === 'Z') {
    return { raw, code: key, label: `${key} generic mana` };
  }

  if (COLOR_NAMES[key]) {
    return { raw, code: key, label: `${COLOR_NAMES[key]} mana` };
  }

  if (key === 'T' || key === 'TAP') {
    return { raw, code: 'T', label: 'tap' };
  }

  if (key === 'Q' || key === 'UNTAP') {
    return { raw, code: 'Q', label: 'untap' };
  }

  if (key === 'S' || key === 'SNOW') {
    return { raw, code: 'S', label: 'snow mana' };
  }

  if (key === 'E' || key === 'ENERGY') {
    return { raw, code: 'E', label: 'energy' };
  }

  const phyrexian = /^(?:([WUBRGC])\/P|P\/([WUBRGC])|P)$/.exec(key);
  if (phyrexian) {
    const color = phyrexian[1] ?? phyrexian[2];
    return {
      raw,
      code: color ? `${color}P` : 'P',
      label: color ? `Phyrexian ${COLOR_NAMES[color]} mana` : 'Phyrexian mana',
    };
  }

  const hybrid = /^([WUBRGC2])\/?([WUBRGC])$/.exec(key);
  if (hybrid) {
    const [, first, second] = hybrid;
    const generic = first === '2';
    const code = generic
      ? `2${second}`
      : (HYBRID_ORDER[`${first}${second}`] ?? `${first}${second}`);
    return {
      raw,
      code,
      label: generic
        ? `two generic or ${COLOR_NAMES[second]} mana`
        : `${COLOR_NAMES[first]} or ${COLOR_NAMES[second]} mana`,
    };
  }

  return null;
}

export function parseManaCost(cost: string | undefined): ManaSymbol[] {
  if (!cost) return [];
  return [...cost.matchAll(/\{([^}]+)\}/g)]
    .map((match) => manaSymbol(match[1]))
    .filter((symbol): symbol is ManaSymbol => symbol !== null);
}

export type ManaTextRun =
  { text: string; symbol?: undefined } | { symbol: ManaSymbol; text?: undefined };

export function splitManaText(text: string): ManaTextRun[] {
  const runs: ManaTextRun[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\{([^}]+)\}/g)) {
    const symbol = manaSymbol(match[1]);
    if (!symbol) continue;
    const before = text.slice(cursor, match.index);
    if (before) runs.push({ text: before });
    runs.push({ symbol });
    cursor = match.index + match[0].length;
  }
  const rest = text.slice(cursor);
  if (rest) runs.push({ text: rest });
  return runs;
}
