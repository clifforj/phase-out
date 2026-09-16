import { type LogLine, appendLogLine, isLogMessage, toLogLine } from '../core/game-log';
import { FIXTURES } from '../testing/fixture';
import { loadFixture } from '../testing/fixture-loader';
import { GLANCE_KINDS, type GameEventKind, gameEvent, gameEvents } from './game-events';

describe('gameEvents', () => {
  function logOf(name: string): LogLine[] {
    let log: LogLine[] = [];
    let nextId = 1;
    for (const line of loadFixture(name)) {
      const frame = line.frame;
      if (frame.type === 'chat' && isLogMessage(frame)) {
        log = appendLogLine(log, toLogLine(frame, nextId++), 500);
      }
    }
    return log;
  }

  const duel = logOf(FIXTURES.spectatorDuel);
  const vsAi = logOf(FIXTURES.playerVsAi);

  function line(text: string, overrides: Partial<LogLine> = {}): LogLine {
    return { id: 1, kind: 'GAME', text, objectIds: [], repeats: 1, ...overrides };
  }

  function kindOf(text: string): GameEventKind | 'dropped' {
    return gameEvent(line(text))?.kind ?? 'dropped';
  }

  it('has two real games to work with', () => {
    expect(duel.length).toBeGreaterThan(50);
    expect(vsAi.length).toBeGreaterThan(50);
  });

  it('surfaces a readable fraction of the log rather than all of it or none of it', () => {
    for (const [name, log] of [
      ['duel', duel],
      ['vs AI', vsAi],
    ] as const) {
      const events = gameEvents(log);
      const share = events.length / log.length;
      expect(share, `${name}: ${events.length} of ${log.length} lines`).toBeGreaterThan(0.25);
      expect(share, `${name}: ${events.length} of ${log.length} lines`).toBeLessThan(0.7);
    }
  });

  it('quotes the engine and never paraphrases it', () => {
    for (const log of [duel, vsAi]) {
      for (const event of gameEvents(log)) {
        const source = log.find((entry) => entry.id === event.id)!;

        expect(event.text).toBe(source.text.replace(/\s*\[[0-9a-f]{3}\]/gi, '').trim());
        expect(event.repeats).toBe(source.repeats);
        expect(event.objectIds).toEqual(source.objectIds);
      }
    }
  });

  it('drops the bookkeeping the board already states', () => {
    expect(kindOf('TURN 9 for bobms0n7xn3 (37 - 41)')).toBe('dropped');
    expect(kindOf('bobms0n7xn3 skip attack')).toBe('dropped');
    expect(kindOf('Computer 1 skips Draw step')).toBe('dropped');
    expect(kindOf('hms0ns6e8jm draws a card')).toBe('dropped');
    expect(kindOf('Computer 1 draws two cards')).toBe('dropped');
    expect(kindOf("Computer 1's library is shuffled")).toBe('dropped');
    expect(kindOf('Computer 1 won the toss')).toBe('dropped');
    expect(kindOf('hms0ns6e8jm keeps hand')).toBe('dropped');
    expect(kindOf('Computer 1 chooses that they take the first turn')).toBe('dropped');
    expect(kindOf('alicems0n7xn3 puts Swamp from hand onto the Battlefield')).toBe('dropped');
    expect(kindOf('bobms0n7xn3 discards down to 7 hand cards')).toBe('dropped');
    expect(kindOf('alicems0n7xn3 paid for Crypt Ghast - Pay {W/B} to Extort?')).toBe('dropped');
    expect(kindOf('hms0ns6e8jm announces a value of 0 for {X}')).toBe('dropped');
    expect(kindOf('Attacker: Crypt Ghast (2/2) unblocked')).toBe('dropped');

    expect(kindOf('alicems0n7xn3 plays Swamp')).toBe('cast');
  });

  it('never drops a line that is quoting a card, whatever the card says', () => {
    expect(
      kindOf(
        "alice - Ability triggers: Howling Mine - At the beginning of each player's draw step, that player draws a card.",
      ),
    ).toBe('trigger');
    expect(
      kindOf('Computer 1 activates: shuffles your library into their library. from Some Card'),
    ).not.toBe('dropped');
  });

  it('reads the sentences that matter as the kind they are', () => {
    expect(kindOf('Computer 1 sacrificed Vampire Hexmage (source: Vampire Hexmage)')).toBe(
      'removal',
    );
    expect(kindOf('Bad Moon was destroyed by Doom Blade')).toBe('removal');
    expect(kindOf('Grave Titan died')).toBe('removal');
    expect(kindOf('Tragic Slip has been fizzled.')).toBe('removal');
    expect(kindOf('Tragic Slip is countered by Counterspell')).toBe('removal');
    expect(kindOf('Bad Moon is put into graveyard from battlefield')).toBe('removal');

    expect(kindOf('Computer 1 loses 3 life at combat from Vampire Hexmage')).toBe('damage');
    expect(kindOf('Crypt Ghast deals 2 damage to Bad Moon')).toBe('damage');
    expect(kindOf('Bad Moon gets 2 damage')).toBe('damage');
    expect(kindOf('alicems0n7xn3 gains 1 life (source: Crypt Ghast)')).toBe('life');

    expect(kindOf('Computer 1 casts Vampire Hexmage from hand')).toBe('cast');
    expect(kindOf('Computer 1 activates: draw a card. from Polluted Mire')).toBe('cast');
    expect(kindOf('alicems0n7xn3 attacks bobms0n7xn3 with 4 creatures')).toBe('combat');
    expect(kindOf('alicems0n7xn3 puts Grave Titan from stack onto the Battlefield')).toBe(
      'resolve',
    );
    expect(kindOf('alicems0n7xn3 creates a Zombie Token token')).toBe('resolve');
    expect(kindOf('alicexyz has won the game')).toBe('ending');
    expect(kindOf('bobxyz lost the game due life is 0 or less')).toBe('ending');

    expect(kindOf('Some Card: alice puts 2 +1/+1 counters on Grave Titan')).toBe('other');
    expect(kindOf('It has become night')).toBe('other');
    expect(kindOf('alicexyz is the monarch')).toBe('other');
  });

  it('reads a trigger as a trigger, however its rules text reads', () => {
    expect(
      kindOf(
        'alicems0n7xn3 - Ability triggers: Crypt Ghast - Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)',
      ),
    ).toBe('trigger');
    expect(
      kindOf(
        'alicems0n7xn3 - Ability triggers: Grave Titan - Whenever Grave Titan enters or attacks, create two 2/2 black Zombie creature tokens.',
      ),
    ).toBe('trigger');
    expect(
      kindOf(
        'alicems0n7xn3 - Ability triggers: Shriekmaw - When this permanent enters, if its evoke cost was paid, its controller sacrifices it.',
      ),
    ).toBe('trigger');

    expect(
      kindOf('Computer 1 activates: destroy target creature. from Some Card targeting Bad Moon'),
    ).toBe('cast');
  });

  it('ignores STATUS lines, which are arrivals rather than the game', () => {
    expect(gameEvent(line('web-a3f9c2 has started watching', { kind: 'STATUS' }))).toBeNull();
  });

  it('only asks for a pause after something consequential', () => {
    expect([...GLANCE_KINDS].sort()).toEqual(['damage', 'ending', 'removal']);
    for (const kind of [
      'cast',
      'trigger',
      'resolve',
      'combat',
      'life',
      'other',
    ] as GameEventKind[]) {
      expect(GLANCE_KINDS.has(kind), `${kind} must not stall play`).toBe(false);
    }
  });

  it('finds consequential events in the real games, so the pause is not theoretical', () => {
    const glanced = gameEvents([...duel, ...vsAi]).filter((event) => GLANCE_KINDS.has(event.kind));
    expect(glanced.length).toBeGreaterThan(5);
    expect(new Set(glanced.map((event) => event.kind)).size).toBeGreaterThan(1);
  });
});
