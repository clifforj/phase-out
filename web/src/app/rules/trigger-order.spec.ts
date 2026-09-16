import type { CardView, PromptView } from '../core/protocol';
import { ordinalLabel, triggerOrderPrompt, triggerPickSequence } from './trigger-order';

function prompt(overrides: Partial<PromptView> = {}): PromptView {
  return {
    kind: 'GAME_TARGET',
    required: true,
    cards: [],
    cards2: [],
    selectableTargets: [],
    chosenTargets: [],
    choices: [],
    amounts: [],
    possibleAttackers: [],
    possibleBlockers: [],
    expects: ['chooseTarget'],
    ...overrides,
  };
}

function ability(objectId: string, rule: string): CardView {
  return {
    objectId,
    name: 'Crypt Ghast',
    rules: [rule],
    colors: [],
    icons: [],
    faceDown: false,
    isToken: false,
    counters: [],
    targets: [],
    isAbility: true,
  };
}

function card(objectId: string): CardView {
  return {
    objectId,
    name: objectId,
    rules: [],
    colors: [],
    icons: [],
    faceDown: false,
    isToken: false,
    counters: [],
    targets: [],
  };
}

describe('triggerOrderPrompt', () => {
  it('recognises a list of abilities with no target zone', () => {
    const dialog = prompt({
      message: 'Pick triggered ability (goes to the stack first)',
      cards: [ability('a1', 'Extort'), ability('a2', 'Whenever this creature enters…')],
      selectableTargets: ['a1', 'a2'],
    });
    expect(triggerOrderPrompt(dialog)).toBe(dialog);
  });

  it('leaves a library search alone', () => {
    expect(
      triggerOrderPrompt(prompt({ targetZone: 'LIBRARY', cards: [card('c1'), card('c2')] })),
    ).toBeNull();
  });

  it('leaves a mixed list alone rather than reordering real cards', () => {
    expect(triggerOrderPrompt(prompt({ cards: [ability('a1', 'Extort'), card('c1')] }))).toBeNull();
  });

  it('ignores a single ability — XMage never asks about one', () => {
    expect(triggerOrderPrompt(prompt({ cards: [ability('a1', 'Extort')] }))).toBeNull();
  });

  it('ignores anything that is not a GAME_TARGET', () => {
    expect(
      triggerOrderPrompt(
        prompt({ kind: 'GAME_SELECT', cards: [ability('a1', 'x'), ability('a2', 'y')] }),
      ),
    ).toBeNull();
  });
});

describe('triggerPickSequence', () => {
  it('sends the reverse of the resolution order, minus the last', () => {
    expect(triggerPickSequence(['a', 'b', 'c'])).toEqual(['c', 'b']);
  });

  it('is one send for two triggers: the one that resolves second', () => {
    expect(triggerPickSequence(['a', 'b'])).toEqual(['b']);
  });

  it('never sends a pick for the last trigger, which XMage places without asking', () => {
    const order = ['a', 'b', 'c', 'd'];
    const sent = triggerPickSequence(order);
    expect(sent).toHaveLength(order.length - 1);
    expect(sent).not.toContain('a');
  });

  it('does not mutate the order it was given', () => {
    const order = ['a', 'b', 'c'];
    triggerPickSequence(order);
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('ordinalLabel', () => {
  it('reads as a position rather than a count', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinalLabel)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
    ]);
  });
});
