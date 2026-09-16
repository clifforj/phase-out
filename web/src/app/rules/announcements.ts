export interface TurnSignal {
  turn: number;

  activePlayerId: string | null;
  activeName: string | null;
  activeIsMe: boolean;

  phase: string | null;
}

export interface Announcement {
  kind: 'turn' | 'phase';
  text: string;

  detail: string;

  mine: boolean;
}

export function announcementFor(
  previous: TurnSignal | null,
  next: TurnSignal,
): Announcement | null {
  if (!previous) return null;

  if (previous.turn !== next.turn || previous.activePlayerId !== next.activePlayerId) {
    return {
      kind: 'turn',
      text: next.activeIsMe ? 'Your turn' : `${next.activeName ?? 'Somebody'}’s turn`,
      detail: `turn ${next.turn}`,
      mine: next.activeIsMe,
    };
  }

  if (next.phase && previous.phase !== next.phase) {
    return {
      kind: 'phase',
      text: next.phase,
      detail: next.activeIsMe ? 'your turn' : `${next.activeName ?? 'somebody'}’s turn`,
      mine: next.activeIsMe,
    };
  }

  return null;
}
