import { appendLogLine, isLogMessage, toLogLine, type LogLine } from '../core/game-log';
import type { CardView, ServerFrame } from '../core/protocol';
import { FIXTURES } from '../testing/fixture';
import { loadFixture } from '../testing/fixture-loader';
import { beingCast, castAnnouncement, stackHint } from './stack-hint';

describe('stackHint', () => {
  function stackMoments(name: string): { card: CardView; log: LogLine[] }[] {
    const frames = loadFixture(name).map((line) => line.frame as ServerFrame);
    const moments: { card: CardView; log: LogLine[] }[] = [];
    const seen = new Set<string>();
    let log: LogLine[] = [];
    let nextId = 1;

    for (const frame of frames) {
      if (frame.type === 'chat' && isLogMessage(frame)) {
        log = appendLogLine(log, toLogLine(frame, nextId++), 500);
      }
      const game =
        frame.type === 'gameState' ? frame.game : frame.type === 'prompt' ? frame.game : null;
      for (const card of game?.stack ?? []) {
        if (seen.has(card.objectId)) continue;
        seen.add(card.objectId);
        moments.push({ card, log: [...log] });
      }
    }
    return moments;
  }

  const moments = [...stackMoments(FIXTURES.spectatorDuel), ...stackMoments(FIXTURES.playerVsAi)];

  it('has real stack items to work with', () => {
    expect(moments.length).toBeGreaterThan(5);
  });

  it('only ever quotes a line the engine really wrote', () => {
    const quoted = moments.filter(({ card, log }) => stackHint(card, log));
    expect(quoted.length, 'nothing at all matched a log line').toBeGreaterThan(0);

    for (const { card, log } of quoted) {
      const hint = stackHint(card, log)!;

      const written = log.some((line) => {
        const stripped = line.text.replace(/\s*\[[0-9a-f]{3}\]/gi, '').trim();
        return stripped === hint.headline || stripped === `${hint.headline} - ${hint.detail}`;
      });
      expect(written, `"${hint.headline}" is not a line the engine wrote`).toBe(true);
    }
  });

  it('says nothing at all until the engine has spoken', () => {
    const spell: CardView = {
      objectId: 's1',
      name: 'Crypt Ghast',
      typeLine: 'Creature — Spirit',
      rules: [],
      colors: ['B'],
      icons: [],
      counters: [],
      targets: [],
      faceDown: false,
      isToken: false,
    };

    expect(stackHint(spell, [])).toBeNull();

    const log: LogLine[] = [
      {
        id: 1,
        kind: 'GAME',
        text: 'alice casts Crypt Ghast [f3a] from hand',
        objectIds: [],
        repeats: 1,
      },
    ];
    expect(stackHint(spell, log)?.headline).toBe('alice casts Crypt Ghast from hand');
  });

  it('ties an ability to its own trigger line rather than the latest one', () => {
    const ability: CardView = {
      objectId: 'a1',
      name: 'Ability',
      rules: ['Extort <i>(Whenever you cast a spell, you may pay {W/B}.)</i>'],
      colors: [],
      icons: [],
      counters: [],
      targets: [],
      faceDown: false,
      isToken: false,
    };
    const log: LogLine[] = [
      {
        id: 1,
        kind: 'GAME',
        text: 'alice - Ability triggers: Crypt Ghast [f3a] - Extort (Whenever you cast a spell, you may pay {W/B}.)',
        objectIds: [],
        repeats: 1,
      },
      {
        id: 2,
        kind: 'GAME',
        text: 'alice - Ability triggers: Grave Titan [a2a] - Whenever Grave Titan [a2a] enters, create two Zombies.',
        objectIds: [],
        repeats: 1,
      },
    ];

    expect(stackHint(ability, log)?.headline).toContain('Crypt Ghast');
  });

  it('tells apart two activated abilities on the stack from different sources', () => {
    const lattice: CardView = {
      objectId: 'ab1',
      name: 'Ability',
      rules: ['{3}, {T}: Untap target artifact.'],
      colors: [],
      icons: [],
      counters: [],
      targets: [],
      faceDown: false,
      isToken: false,
    };
    const gear: CardView = {
      objectId: 'ab2',
      name: 'Ability',
      rules: ['{2}: Attach Adventuring Gear to target creature you control.'],
      colors: [],
      icons: [],
      counters: [],
      targets: [],
      faceDown: false,
      isToken: false,
    };
    const log: LogLine[] = [
      {
        id: 1,
        kind: 'GAME',
        text: 'opponent activates: untap target artifact. from Mycosynth Lattice [7d1]',
        objectIds: [],
        repeats: 1,
      },
      {
        id: 2,
        kind: 'GAME',
        text: 'you activates: attach Adventuring Gear to target creature you control. from Adventuring Gear [9c2]',
        objectIds: [],
        repeats: 1,
      },
    ];
    expect(stackHint(lattice, log)?.headline).toContain('Mycosynth Lattice');
    expect(stackHint(gear, log)?.headline).toContain('Adventuring Gear');
  });

  it('prefers the most recent line about a card that has been cast twice', () => {
    const log: LogLine[] = [
      {
        id: 1,
        kind: 'GAME',
        text: 'alice casts Vampire Hexmage [111] from hand',
        objectIds: [],
        repeats: 1,
      },
      { id: 2, kind: 'GAME', text: 'alice draws a card', objectIds: [], repeats: 1 },
      {
        id: 3,
        kind: 'GAME',
        text: 'bob casts Vampire Hexmage [222] from hand',
        objectIds: [],
        repeats: 1,
      },
    ];
    const card: CardView = {
      objectId: 'v1',
      name: 'Vampire Hexmage',
      typeLine: 'Creature — Vampire Shaman',
      rules: [],
      colors: ['B'],
      icons: [],
      counters: [],
      targets: [],
      faceDown: false,
      isToken: false,
    };
    const hint = stackHint(card, log);
    expect(hint?.headline).toBe('bob casts Vampire Hexmage from hand');
    expect(hint?.detail).toBe('Creature — Vampire Shaman');
  });

  it('reports a spell on the stack of a mana prompt as still being cast', () => {
    const frames = loadFixture(FIXTURES.playerVsAi).map((line) => line.frame as ServerFrame);
    let log: LogLine[] = [];
    let nextId = 1;
    const checked: string[] = [];
    const shadowed: string[] = [];

    for (const frame of frames) {
      if (frame.type === 'chat' && isLogMessage(frame)) {
        log = appendLogLine(log, toLogLine(frame, nextId++), 500);
      }
      if (frame.type !== 'prompt' || frame.prompt.kind !== 'GAME_PLAY_MANA') continue;
      const top = frame.game?.stack?.[0];
      if (!top) continue;
      const name = top.displayName || top.name;

      if (log.some((line) => castAnnouncement(name).test(line.text.toLowerCase()))) {
        shadowed.push(name);
        continue;
      }
      expect(beingCast(top, log), `${name} was announced before it was paid for`).toBe(true);
      checked.push(name);
    }

    expect(
      checked.length,
      'the capture has no mana prompt with an unpaid spell on the stack',
    ).toBeGreaterThan(0);

    expect(shadowed).toEqual(['Vampire Hexmage', 'Vampire Hexmage']);

    for (const name of checked) {
      expect(
        log.some((line) => castAnnouncement(name).test(line.text.toLowerCase())),
        `the engine never announced ${name} at all`,
      ).toBe(true);
    }
  });

  it('does not repeat the ability text in detail when "activates:" only rephrases it', () => {
    const ability: CardView = {
      objectId: 'a2',
      name: 'Ability',
      rules: [
        '{T}, Sacrifice Escape Tunnel: Search your library for a basic land card, ' +
          'put it onto the battlefield tapped, then shuffle.',
      ],
      colors: [],
      icons: [],
      counters: [],
      targets: [],
      faceDown: false,
      isToken: false,
    };
    const log: LogLine[] = [
      {
        id: 1,
        kind: 'GAME',
        text:
          'john activates: search your library for a basic land card, put it onto the battlefield tapped, ' +
          'then shuffle. from Escape Tunnel [4a9]',
        objectIds: [],
        repeats: 1,
      },
    ];
    const hint = stackHint(ability, log);
    expect(hint?.headline).toContain('john activates');
    expect(hint?.detail).toBe('');
  });

  it('does not mistake a line that merely mentions the card for its cast', () => {
    const hexmage: CardView = {
      objectId: 'h1',
      name: 'Vampire Hexmage',
      typeLine: 'Creature — Vampire Shaman',
      rules: [],
      colors: ['B'],
      icons: [],
      counters: [],
      targets: [],
      faceDown: false,
      isToken: false,
    };
    const notCasts = [
      'hms0ns6e8jm casts Tragic Slip [caf] targeting Vampire Hexmage [613] from hand',
      'Computer 1 sacrificed Vampire Hexmage [613] (source: Vampire Hexmage [613])',
      'Computer 1 puts Vampire Hexmage [613] from stack onto the Battlefield',
      'Computer 1 activates: remove all counters from target permanent. from Vampire Hexmage [613]',
    ].map((text, index): LogLine => ({
      id: index + 1,
      kind: 'GAME',
      text,
      objectIds: [],
      repeats: 1,
    }));

    expect(stackHint(hexmage, notCasts)).toBeNull();
    expect(beingCast(hexmage, notCasts)).toBe(true);
  });

  it('never shows a spectator a payment in progress', () => {
    const frames = loadFixture(FIXTURES.spectatorDuel).map((line) => line.frame as ServerFrame);
    const manaPrompts = frames.filter(
      (frame) => frame.type === 'prompt' && frame.prompt.kind === 'GAME_PLAY_MANA',
    );
    expect(manaPrompts.length).toBe(0);
  });

  it('cannot be joined by id, because the log links the card and the stack holds the spell', () => {
    for (const { card, log } of moments) {
      const linked = new Set(log.flatMap((line) => line.objectIds));
      expect(linked.size, 'the log linked no ids at all').toBeGreaterThan(0);
      expect(
        linked.has(card.objectId),
        `${card.name}: the log linked the stack object's own id`,
      ).toBe(false);
    }

    const frames = loadFixture(FIXTURES.spectatorDuel).map((line) => line.frame as ServerFrame);
    const permanentIds = new Set<string>();
    const loggedIds = new Set<string>();
    for (const frame of frames) {
      if (frame.type === 'chat') {
        for (const match of frame.text.matchAll(/object_id='([0-9a-fA-F-]{36})'/g))
          loggedIds.add(match[1]);
      }
      if (frame.type !== 'gameState') continue;
      for (const player of frame.game.players) {
        for (const permanent of player.battlefield) permanentIds.add(permanent.card.objectId);
      }
    }
    const shared = [...loggedIds].filter((id) => permanentIds.has(id));
    expect(shared.length, 'no logged id belongs to a permanent either').toBeGreaterThan(0);
  });
});
