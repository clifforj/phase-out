import type { PlayerStateView } from '../../core/protocol';
import type { SeatRef } from '../../rules/zones';
import type { Vec3 } from './layout';
import {
  BACK_Z,
  BOARD_CARD_H,
  BOARD_CARD_W,
  COMMAND_MAX_D,
  COMMAND_Z,
  PILE_AREA_H,
  PILE_AREA_W,
  PILE_CARD_H,
  PILE_CARD_W,
  PILE_GAP,
  PILE_Z,
  PLAYER_TARGET_GAP,
  POD_ROW_MAX_W,
  ROW_MAX_W,
  ROW_Z,
  SIDE_GAP,
  SUPPORT_MAX_D,
  SUPPORT_Z,
  ZONE_LABEL_GAP,
} from './sizes';

const TABLE_MARGIN = 0.2;

const COMBAT_SHARE = 0.45;

export interface SeatMetrics {
  ring: number;
  rowMaxW: number;
  supportX: number;
  commandX: number;
  graveyardX: number;

  combatZ: number;
  combatLaneW: number;

  radius: number;

  fieldZ: number;

  reach: number;

  centreRadius: number;
}

export function seatMetrics(count: number): SeatMetrics {
  const rowMaxW = count <= 2 ? ROW_MAX_W : POD_ROW_MAX_W;
  const supportX = rowMaxW / 2 + SIDE_GAP;
  const graveyardX = -(rowMaxW / 2 + PILE_AREA_W / 2 + PILE_GAP);

  const parts = [
    {
      halfWidth: rowMaxW / 2,
      near: ROW_Z.creature - BOARD_CARD_H / 2,
      far: ROW_Z.land + BOARD_CARD_H / 2,
    },
    {
      halfWidth: supportX + BOARD_CARD_W / 2,
      near: SUPPORT_Z - SUPPORT_MAX_D / 2 - BOARD_CARD_H / 2,
      far: SUPPORT_Z + SUPPORT_MAX_D / 2 + BOARD_CARD_H / 2,
    },
    {
      halfWidth: supportX + PILE_CARD_W / 2,
      near: COMMAND_Z - COMMAND_MAX_D / 2 - PILE_CARD_H / 2,
      far: COMMAND_Z + COMMAND_MAX_D / 2 + PILE_CARD_H / 2,
    },
    {
      halfWidth: -graveyardX + PILE_AREA_W / 2 + ZONE_LABEL_GAP,
      near: PILE_Z - PILE_AREA_H / 2,
      far: PILE_Z + PILE_AREA_H / 2,
    },
    { halfWidth: 0, near: BACK_Z, far: BACK_Z + PLAYER_TARGET_GAP },
  ];

  const wedge = count > 2 ? Math.tan(Math.PI / count) : 0;
  const ring = wedge ? Math.max(0, ...parts.map((part) => part.halfWidth / wedge - part.near)) : 0;
  const radius =
    Math.max(...parts.map((part) => Math.hypot(part.halfWidth, ring + part.far))) + TABLE_MARGIN;
  const centreRadius = ring + Math.min(...parts.slice(0, -1).map((part) => part.near));

  return {
    ring,
    rowMaxW,
    supportX,
    commandX: -supportX,
    graveyardX,
    combatZ: ROW_Z.combat + ring * COMBAT_SHARE,

    combatLaneW: ROW_MAX_W * 0.9,
    radius,
    fieldZ: ring + (ROW_Z.creature + ROW_Z.land) / 2,
    reach: ring + ROW_Z.land + BOARD_CARD_H / 2,
    centreRadius,
  };
}

export const TABLE_RADIUS = seatMetrics(2).radius;

export interface Seat extends SeatRef {
  angle: number;

  yaw: number;
  ring: number;
}

export function seatPlayers(players: PlayerStateView[], focusPlayerId?: string | null): Seat[] {
  if (!players.length) return [];
  const start = Math.max(
    0,
    players.findIndex((player) => player.playerId === focusPlayerId),
  );
  const step = (2 * Math.PI) / players.length;
  const { ring } = seatMetrics(players.length);
  return players.map((_, offset) => {
    const player = players[(start + offset) % players.length];
    const angle = offset * step;
    return { index: offset, angle, yaw: seatYaw(angle), ring, player };
  });
}

export function seatYaw(angle: number): number {
  const turn = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (turn > Math.PI / 2) return turn - Math.PI;
  if (turn < -Math.PI / 2) return turn + Math.PI;
  return turn;
}

export function seatPoint(seat: Seat, lx: number, lz: number, y: number): Vec3 {
  return toWorld(seat.angle, lx, lz + seat.ring, y);
}

export function toWorld(angle: number, lx: number, lz: number, y: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: lx * cos + lz * sin, y, z: -lx * sin + lz * cos };
}
