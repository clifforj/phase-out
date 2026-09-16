import { advanceRound, initialRoundTrackerState } from './round-tracker';

describe('advanceRound', () => {
  it('stays in round 1 until the active player repeats', () => {
    let state = initialRoundTrackerState;
    state = advanceRound(state, 1, 'a');
    expect(state.round).toBe(1);
    state = advanceRound(state, 2, 'b');
    expect(state.round).toBe(1);
    state = advanceRound(state, 3, 'c');
    expect(state.round).toBe(1);
    state = advanceRound(state, 4, 'a');
    expect(state.round).toBe(2);
  });

  it('keeps counting the round correctly after a player leaves mid-game', () => {
    let state = initialRoundTrackerState;
    state = advanceRound(state, 1, 'a');
    state = advanceRound(state, 2, 'b');
    state = advanceRound(state, 3, 'c');
    state = advanceRound(state, 4, 'a');
    expect(state.round).toBe(2);
    state = advanceRound(state, 5, 'c');
    expect(state.round).toBe(2);
    state = advanceRound(state, 6, 'a');
    expect(state.round).toBe(3);
  });

  it('ignores a repeated frame for the same turn', () => {
    let state = advanceRound(initialRoundTrackerState, 1, 'a');
    const again = advanceRound(state, 1, 'a');
    expect(again).toBe(state);
  });

  it('resets to round 1 when the turn counter goes backwards (a new game)', () => {
    let state = initialRoundTrackerState;
    state = advanceRound(state, 5, 'a');
    state = advanceRound(state, 1, 'x');
    expect(state.round).toBe(1);
    expect(state.seenThisRound.has('x')).toBe(true);
  });

  it('does not advance the round when the active player is unknown', () => {
    let state = advanceRound(initialRoundTrackerState, 1, 'a');
    state = advanceRound(state, 2, null);
    expect(state.round).toBe(1);
    expect(state.turn).toBe(2);
  });
});
