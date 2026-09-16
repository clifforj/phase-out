import type { PlayerStateView } from '../core/protocol';

export type ZoneKind = 'graveyard' | 'exile';

export interface ZoneRef {
  seat: number;
  kind: ZoneKind;
}

export function sameZone(one: ZoneRef | null, other: ZoneRef | null): boolean {
  if (!one || !other) return one === other;
  return one.seat === other.seat && one.kind === other.kind;
}

export interface SeatRef {
  index: number;
  player: PlayerStateView;
}
