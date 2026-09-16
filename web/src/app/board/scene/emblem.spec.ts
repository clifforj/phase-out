import type { CardView } from '../../core/protocol';
import { type EmblemId, MAX_EMBLEMS, emblemsFor, paintEmblem } from './emblem';

describe('card emblems', () => {
  const card = (overrides: Partial<CardView>): CardView =>
    ({
      objectId: 'id',
      name: 'Test Creature',
      rules: [],
      colors: [],
      icons: [],
      counters: [],
      targets: [],
      ...overrides,
    }) as CardView;

  const icon = (type: string) => ({ type, text: '', hint: '' });

  it('reads XMage ability icons', () => {
    const emblems = emblemsFor(
      card({ icons: [icon('ABILITY_FLYING'), icon('ABILITY_DEATHTOUCH')] }),
    );
    expect(emblems).toEqual(['flying', 'deathtouch']);
  });

  it('ignores icons that are not abilities', () => {
    expect(emblemsFor(card({ icons: [icon('COMMANDER'), icon('PLAYABLE_COUNT')] }))).toEqual([]);
  });

  it('orders emblems by priority rather than by the order XMage sent them', () => {
    const emblems = emblemsFor(
      card({ icons: [icon('ABILITY_INFECT'), icon('ABILITY_VIGILANCE'), icon('ABILITY_FLYING')] }),
    );
    expect(emblems).toEqual(['flying', 'vigilance', 'infect']);
  });

  it('caps at two rows of three, keeping the ones that decide an attack', () => {
    const emblems = emblemsFor(
      card({
        icons: [
          'ABILITY_FLYING',
          'ABILITY_TRAMPLE',
          'ABILITY_DOUBLE_STRIKE',
          'ABILITY_DEATHTOUCH',
          'ABILITY_VIGILANCE',
          'ABILITY_HEXPROOF',
          'ABILITY_INDESTRUCTIBLE',
          'ABILITY_LIFELINK',
          'ABILITY_REACH',
        ].map(icon),
      }),
    );
    expect(emblems.length).toBe(MAX_EMBLEMS);
    expect(emblems).toEqual([
      'flying',
      'trample',
      'doubleStrike',
      'deathtouch',
      'vigilance',
      'hexproof',
    ]);
  });

  it('lets double strike stand in for first strike', () => {
    const emblems = emblemsFor(
      card({ icons: [icon('ABILITY_FIRST_STRIKE'), icon('ABILITY_DOUBLE_STRIKE')] }),
    );
    expect(emblems).toEqual(['doubleStrike']);
  });

  it('reads a keyword line, with or without its reminder text', () => {
    expect(emblemsFor(card({ rules: ['Menace'] }))).toEqual(['menace']);
    expect(
      emblemsFor(
        card({
          rules: [
            "Menace <i>(This creature can't be blocked except by two or more creatures.)</i>",
          ],
        }),
      ),
    ).toEqual(['menace']);
    expect(
      emblemsFor(
        card({
          rules: ["Shroud <i>(This permanent can't be the target of spells or abilities.)</i>"],
        }),
      ),
    ).toEqual(['shroud']);
  });

  it('reads "protection from X" as its own keyword line, not a subject clause granting it to something else', () => {
    expect(emblemsFor(card({ rules: ['Protection from red'] }))).toEqual(['protection']);
    expect(
      emblemsFor(
        card({
          rules: [
            "Protection from red <i>(This creature can't be blocked, targeted, dealt damage, enchanted, or equipped by anything red.)</i>",
          ],
        }),
      ),
    ).toEqual(['protection']);
    expect(emblemsFor(card({ rules: ['Enchanted creature has protection from red.'] }))).toEqual(
      [],
    );
  });

  it('reads a self-referencing "can\'t be blocked" line, but not a qualified or granted one', () => {
    expect(
      emblemsFor(card({ name: 'Slither Blade', rules: ["Slither Blade can't be blocked."] })),
    ).toEqual(['unblockable']);
    expect(emblemsFor(card({ rules: ["{this} can't be blocked."] }))).toEqual(['unblockable']);
    expect(
      emblemsFor(
        card({
          name: 'Slith Bolt Slinger',
          rules: ["Slith Bolt Slinger can't be blocked by creatures with power 2 or less."],
        }),
      ),
    ).toEqual([]);
    expect(emblemsFor(card({ rules: ["Enchanted creature can't be blocked."] }))).toEqual([]);
    expect(
      emblemsFor(
        card({ rules: ["Whenever this creature attacks, it can't be blocked this turn."] }),
      ),
    ).toEqual([]);
  });

  it('reads keywords out of a combined line', () => {
    expect(
      emblemsFor(card({ rules: ['Flying, menace, haste'], icons: [icon('ABILITY_FLYING')] })),
    ).toEqual(['flying', 'menace', 'haste']);
  });

  it('does not claim a keyword a card only grants to others', () => {
    expect(emblemsFor(card({ rules: ['Creatures you control have menace.'] }))).toEqual([]);
    expect(
      emblemsFor(
        card({ rules: ['Whenever this creature attacks, it gains haste until end of turn.'] }),
      ),
    ).toEqual([]);
    expect(emblemsFor(card({ rules: ['Enchanted creature gets +2/+0 and has menace.'] }))).toEqual(
      [],
    );
  });

  it('shows nothing on a face-down card, whatever the view still carries', () => {
    expect(
      emblemsFor(card({ faceDown: true, icons: [icon('ABILITY_FLYING')], rules: ['Menace'] })),
    ).toEqual([]);
  });

  it('paints every emblem badge inside its bounds, without leaking state', () => {
    const all: EmblemId[] = [
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

    const empty: EmblemId[] = [];
    const outside: string[] = [];
    const unbalanced: EmblemId[] = [];
    for (const size of [17, 26]) {
      for (const emblem of all) {
        const recorder = recordingContext();
        paintEmblem(recorder.ctx, emblem, 12, 40, size);
        if (size === 17 && !recorder.points.length) empty.push(emblem);

        const inside = ([x, y]: [number, number]) =>
          x >= 12 && x <= 12 + size && y >= 40 && y <= 40 + size;
        if (recorder.points.some((point) => !inside(point))) outside.push(`${emblem}@${size}`);
        if (recorder.depth() !== 0) unbalanced.push(emblem);
      }
    }
    expect({ empty, outside, unbalanced }).toEqual({ empty: [], outside: [], unbalanced: [] });
  });

  it('does not repeat an emblem that both sources found', () => {
    expect(
      emblemsFor(card({ icons: [icon('ABILITY_FLYING')], rules: ['Flying', 'Menace'] })),
    ).toEqual(['flying', 'menace']);
  });
});

function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  points: [number, number][];
  depth: () => number;
} {
  const points: [number, number][] = [];
  const stack: { ox: number; oy: number; scale: number }[] = [];
  let state = { ox: 0, oy: 0, scale: 1 };

  const at = (...coords: number[]) => {
    for (let i = 0; i < coords.length; i += 2) {
      points.push([state.ox + coords[i] * state.scale, state.oy + coords[i + 1] * state.scale]);
    }
  };

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    save: () => stack.push({ ...state }),
    restore: () => {
      state = stack.pop() ?? state;
    },
    translate: (x: number, y: number) => {
      state.ox += x * state.scale;
      state.oy += y * state.scale;
    },
    scale: (sx: number) => {
      state.scale *= sx;
    },
    beginPath: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: at,
    lineTo: at,
    quadraticCurveTo: at,
    bezierCurveTo: at,

    arcTo: (x1: number, y1: number, x2: number, y2: number) => at(x1, y1, x2, y2),
    rect: (x: number, y: number, w: number, h: number) => at(x, y, x + w, y + h),
    arc: (x: number, y: number, r: number) => at(x - r, y - r, x + r, y + r),
    ellipse: (x: number, y: number, rx: number, ry: number) => at(x - rx, y - ry, x + rx, y + ry),
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, points, depth: () => stack.length };
}
