export interface RoundTrackerState {
  readonly round: number;
  readonly turn: number;
  readonly seenThisRound: ReadonlySet<string>;
}

export const initialRoundTrackerState: RoundTrackerState = {
  round: 1,
  turn: 0,
  seenThisRound: new Set(),
};

export function advanceRound(
  state: RoundTrackerState,
  turn: number,
  activePlayerId: string | null,
): RoundTrackerState {
  if (turn === state.turn) return state;
  if (turn < state.turn) {
    return {
      round: 1,
      turn,
      seenThisRound: activePlayerId ? new Set([activePlayerId]) : new Set(),
    };
  }
  if (!activePlayerId) return { ...state, turn };
  if (state.seenThisRound.has(activePlayerId)) {
    return { round: state.round + 1, turn, seenThisRound: new Set([activePlayerId]) };
  }
  return {
    round: state.round,
    turn,
    seenThisRound: new Set([...state.seenThisRound, activePlayerId]),
  };
}
