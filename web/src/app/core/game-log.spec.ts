import { LogLine, appendLogLine, isLogMessage, stripMarkup, toLogLine } from './game-log';
import type { Chat } from './protocol';
import { FIXTURES } from '../testing/fixture';
import { loadFixture } from '../testing/fixture-loader';

function chat(overrides: Partial<Chat> = {}): Chat {
  return { type: 'chat', objectId: 'chat-1', text: 'something happened', ...overrides };
}

describe('game log extraction', () => {
  it('keeps GAME and STATUS, drops player chatter', () => {
    expect(isLogMessage(chat({ messageType: 'GAME' }))).toBe(true);
    expect(isLogMessage(chat({ messageType: 'STATUS' }))).toBe(true);
    for (const type of ['TALK', 'WHISPER_FROM', 'WHISPER_TO', 'USER_INFO', undefined]) {
      expect(isLogMessage(chat({ messageType: type }))).toBe(false);
    }
  });

  it('strips XMage HTML and keeps the object ids it linked', () => {
    const line = toLogLine(
      chat({
        messageType: 'GAME',
        turnInfo: 'Turn 3 (alice)',
        text:
          "<font color='#20B2AA'>alice</font> plays " +
          "<font color='#B0C4DE' object_id='4f4d1b0a-1111-2222-3333-444455556666'>Swamp</font>",
      }),
      1,
    );

    expect(line.text).toBe('alice plays Swamp');
    expect(line.objectIds).toEqual(['4f4d1b0a-1111-2222-3333-444455556666']);
    expect(line.turnInfo).toBe('Turn 3 (alice)');
    expect(line.kind).toBe('GAME');
  });

  it('puts the name back in front of a STATUS line', () => {
    const line = toLogLine(
      chat({ messageType: 'STATUS', from: 'watch-abc', text: ' has joined' }),
      1,
    );
    expect(line.text).toBe('watch-abc has joined');
    expect(line.kind).toBe('STATUS');
  });

  it('leaves no markup in any line of a real capture', () => {
    const chats = loadFixture(FIXTURES.spectatorDuel)
      .map((line) => line.frame)
      .filter((frame): frame is Chat => frame.type === 'chat')
      .filter(isLogMessage);
    expect(chats.length).toBeGreaterThan(10);

    for (const [index, frame] of chats.entries()) {
      const line = toLogLine(frame, index);
      expect(line.text).not.toMatch(/[<>]/);
      expect(line.text.length).toBeGreaterThan(0);
    }
  });

  describe('appending', () => {
    const line = (text: string, id = 1): LogLine =>
      toLogLine(chat({ messageType: 'GAME', text }), id);

    it('collapses an immediate repeat into a count', () => {
      let lines: LogLine[] = [];
      for (let i = 0; i < 143; i++) {
        lines = appendLogLine(lines, line('bob lost the game due life is 0 or less', i), 500);
      }
      expect(lines).toHaveLength(1);
      expect(lines[0].repeats).toBe(143);
    });

    it('keeps non-consecutive repeats as separate lines', () => {
      let lines: LogLine[] = [];
      lines = appendLogLine(lines, line('alice draws a card', 1), 500);
      lines = appendLogLine(lines, line('alice plays Swamp', 2), 500);
      lines = appendLogLine(lines, line('alice draws a card', 3), 500);
      expect(lines).toHaveLength(3);
      expect(lines.every((l) => l.repeats === 1)).toBe(true);
    });

    it('is bounded, keeping the most recent lines', () => {
      let lines: LogLine[] = [];
      for (let i = 0; i < 60; i++) lines = appendLogLine(lines, line(`event ${i}`, i), 10);
      expect(lines).toHaveLength(10);
      expect(lines.at(-1)!.text).toBe('event 59');
      expect(lines[0].text).toBe('event 50');
    });
  });

  it('decodes entities and collapses whitespace', () => {
    expect(stripMarkup('a&nbsp;&amp;&nbsp;b')).toBe('a & b');
    expect(stripMarkup('  spaced   out  ')).toBe('spaced out');
  });
});
