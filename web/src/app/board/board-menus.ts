import type { MenuAction } from './overlay/context-menu.component';
import type { Placement } from './scene/layout';
import type { Seat } from './scene/seat-metrics';

export type MenuTarget =
  | { kind: 'card'; objectId: string; x: number; y: number }
  | { kind: 'seat'; playerId: string; x: number; y: number };

export interface BoardMenu {
  target: MenuTarget;
  title: string;
  actions: MenuAction[];
}

export const CARD_MENU_ACTIONS: readonly MenuAction[] = [
  { id: 'view', label: 'View card', hint: 'read it at full size' },
];

export function menuFor(
  target: MenuTarget | null,
  placements: readonly Placement[],
  seats: readonly Seat[],
  gameOver: boolean,
): BoardMenu | null {
  if (!target) return null;
  if (target.kind === 'card') {
    const placement = placements.find((candidate) => candidate.objectId === target.objectId);
    if (!placement || placement.kind === 'hand') return null;
    const title = placement.card.displayName || placement.card.name || 'face-down card';
    return { target, title, actions: [...CARD_MENU_ACTIONS] };
  }

  const seat = seats.find((candidate) => candidate.player.playerId === target.playerId);
  if (!seat) return null;
  const player = seat.player;
  const actions: MenuAction[] = [
    {
      id: 'focus',
      label: `View from ${player.name}'s side`,
      hint: 'bring this seat to the near side',
    },
    { id: 'graveyard', label: `View ${player.name}'s graveyard (${player.graveyard.length})` },
    { id: 'exile', label: `View ${player.name}'s exile (${player.exile.length})` },
  ];
  if (player.isMe && !gameOver)
    actions.push({ id: 'concede', label: 'Concede', hint: 'leave the game - asks you to confirm' });
  return { target, title: player.name, actions };
}
