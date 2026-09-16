import type { CardView, GameStateView, PermanentStateView } from '../../core/protocol';
import { indexAttachments, indexCombat, layoutAttachments, layoutCombat } from './combat-layout';
import { layoutHand, layoutSeat, layoutStack } from './placement';
import { seatMetrics, seatPlayers, type Seat, type SeatMetrics } from './seat-metrics';
import type { ZoneRef } from '../../rules/zones';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type SlotKind =
  | 'land'
  | 'creature'
  | 'permanent'
  | 'attachment'
  | 'attacker'
  | 'blocker'
  | 'command'
  | 'graveyard'
  | 'exile'
  | 'library'
  | 'stack'
  | 'hand';

export interface Placement {
  objectId: string;
  card: CardView;

  permanent: PermanentStateView | null;

  seat: number;
  kind: SlotKind;
  position: Vec3;

  spin: number;

  yaw: number;

  tilt: number;

  space: 'table' | 'camera';

  anchor?: 'centre' | 'bottom';
  scale: number;
  tapped: boolean;

  faded: boolean;

  pileId?: string;
}

export interface CombatArrow {
  from: Vec3;
  to: Vec3;

  blocked: boolean;
}

export function zoneOf(kind: SlotKind, seat: number): ZoneRef | null {
  return kind === 'graveyard' || kind === 'exile' ? { seat, kind } : null;
}

export interface ZoneMarker extends ZoneRef {
  angle: number;
  position: Vec3;
  width: number;
  height: number;

  labelPosition: Vec3;
  count: number;
}

export interface BoardLayout {
  seats: Seat[];
  placements: Placement[];
  arrows: CombatArrow[];
  zones: ZoneMarker[];
  table: SeatMetrics;
}

export function defaultFocusPlayerId(game: GameStateView | null): string | null {
  if (!game?.players.length) return null;
  return (game.players.find((player) => player.isMe) ?? game.players[0]).playerId;
}

export interface LayoutOptions {
  showHand?: boolean;

  raisedIds?: readonly string[];
}

export function layoutBoard(
  game: GameStateView | null,
  focusPlayerId?: string | null,
  options?: LayoutOptions,
): BoardLayout {
  const seats = seatPlayers(game?.players ?? [], focusPlayerId);
  const metrics = seatMetrics(seats.length);
  const layout: BoardLayout = { seats, placements: [], arrows: [], zones: [], table: metrics };
  if (!game) return layout;
  const raised = new Set(options?.raisedIds ?? []);

  const combat = indexCombat(game, seats);
  const attachments = indexAttachments(seats, combat);

  for (const seat of seats) layoutSeat(seat, metrics, combat, attachments, raised, layout);
  layoutCombat(seats, metrics, combat, raised, layout);
  layoutAttachments(seats, attachments, raised, layout);
  layoutStack(game.stack, layout);
  if (options?.showHand ?? true) layoutHand(game.myHand, seats, layout);

  return layout;
}
