import type { GameStateView, ServerFrame } from '../core/protocol';
import { FIXTURES } from '../testing/fixture';
import { loadFixture } from '../testing/fixture-loader';

describe('the order of GameStateView.stack', () => {
  const frames = loadFixture(FIXTURES.spectatorDuel).map((line) => line.frame as ServerFrame);

  const states: string[][] = [];
  for (const frame of frames) {
    const game: GameStateView | undefined = frame.type === 'gameState' ? frame.game : undefined;
    if (!game) continue;
    const names = game.stack.map((card) => card.displayName || card.name);
    if (JSON.stringify(names) !== JSON.stringify(states.at(-1))) states.push(names);
  }

  it('has a moment where something is put on top of something else', () => {
    expect(states.some((state) => state.length > 1)).toBe(true);
  });

  it('puts the newest object at index 0, and resolves index 0 first', () => {
    const grew = states.findIndex(
      (state, index) => index > 0 && state.length === 2 && states[index - 1].length === 1,
    );
    expect(grew, 'the capture never has a second object added to the stack').toBeGreaterThan(0);

    const before = states[grew - 1];
    const both = states[grew];
    const after = states[grew + 1];

    const existing = before[0];
    const added = both.find((name) => name !== existing)!;
    expect(added).toBeTruthy();

    expect(both[0]).toBe(added);
    expect(both[1]).toBe(existing);

    expect(after).toEqual([existing]);
  });
});
