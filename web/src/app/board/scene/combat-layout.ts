import type { GameStateView, PermanentStateView } from '../../core/protocol';
import type { BoardLayout, Vec3 } from './layout';
import {
  ATTACHMENT_DX,
  ATTACHMENT_DZ,
  ATTACHMENT_FAN_DZ,
  ATTACHMENT_LAYERS,
  ATTACHMENT_SCALE,
  ATTACHMENT_SLIDE_DZ,
  BACK_Z,
  BOARD_CARD_H,
  CARD_W,
  LAYER_STEP,
  PLAYER_TARGET_GAP,
  ROW_GAP,
  TABLE_Y,
} from './sizes';
import { permanentPlacement, stopShortOf } from './placement';
import type { Seat, SeatMetrics } from './seat-metrics';
import { seatPoint, toWorld } from './seat-metrics';
import { acrossIn, clampTo, part, raisedIn, spreadStep } from './spacing';

export interface CombatIndex {
  roles: Map<string, { role: 'attacker' | 'blocker'; group: number; seat: number }>;
  groups: {
    blocked: boolean;
    defenderSeat: number | null;

    defenderObjectId: string | null;
    attackers: string[];
    blockers: string[];
  }[];
}

function battlefieldIndex(
  seats: Seat[],
): Map<string, { permanent: PermanentStateView; seat: Seat }> {
  const index = new Map<string, { permanent: PermanentStateView; seat: Seat }>();
  for (const seat of seats) {
    for (const permanent of seat.player.battlefield)
      index.set(permanent.card.objectId, { permanent, seat });
  }
  return index;
}

export function indexCombat(game: GameStateView, seats: Seat[]): CombatIndex {
  const battlefield = battlefieldIndex(seats);
  const seatOf = (objectId: string) => battlefield.get(objectId)?.seat.index;

  const index: CombatIndex = { roles: new Map(), groups: [] };
  game.combat.forEach((group, groupIndex) => {
    const defenderObjectId =
      group.defenderId && battlefield.has(group.defenderId) ? group.defenderId : null;
    const defenderSeat = defenderObjectId
      ? seatOf(defenderObjectId)!
      : (seats.find((seat) => seat.player.playerId === group.defenderId)?.index ?? null);
    const collect = (cards: { objectId: string }[], role: 'attacker' | 'blocker') =>
      cards.flatMap((card) => {
        const seat = seatOf(card.objectId);
        if (seat === undefined) return [];
        index.roles.set(card.objectId, { role, group: groupIndex, seat });
        return [card.objectId];
      });
    const attackers = collect(group.attackers, 'attacker');
    const blockers = collect(group.blockers, 'blocker');
    index.groups.push({
      blocked: group.blocked,
      defenderSeat,
      defenderObjectId,
      attackers,
      blockers,
    });
  });
  return index;
}

export interface AttachmentIndex {
  byHost: Map<string, { permanent: PermanentStateView; seat: Seat }[]>;
  attached: Set<string>;
}

export function indexAttachments(seats: Seat[], combat: CombatIndex): AttachmentIndex {
  const battlefield = battlefieldIndex(seats);
  const index: AttachmentIndex = { byHost: new Map(), attached: new Set() };
  for (const { permanent, seat } of battlefield.values()) {
    const host = permanent.attachedTo;
    if (!host || !battlefield.has(host) || battlefield.get(host)!.permanent.attachedTo) continue;
    if (combat.roles.has(permanent.card.objectId)) continue;
    index.byHost.set(host, [...(index.byHost.get(host) ?? []), { permanent, seat }]);
    index.attached.add(permanent.card.objectId);
  }
  return index;
}

export function layoutAttachments(
  seats: Seat[],
  attachments: AttachmentIndex,
  raised: ReadonlySet<string>,
  layout: BoardLayout,
): void {
  const placed = new Map(layout.placements.map((placement) => [placement.objectId, placement]));
  for (const [hostId, group] of attachments.byHost) {
    const host = placed.get(hostId);
    if (!host) continue;
    const hostSeat = seats[host.seat];
    const angle = hostSeat?.angle ?? 0;
    host.position.y += Math.max(ATTACHMENT_LAYERS, group.length + 2) * LAYER_STEP;

    let sliding = raised.has(hostId) ? 0 : group.length;
    group.forEach(({ permanent }, index) => {
      if (raised.has(permanent.card.objectId)) sliding = Math.min(sliding, index);
    });

    group.forEach(({ permanent, seat }, index) => {
      const slide = index >= sliding ? ATTACHMENT_SLIDE_DZ : 0;
      const offset = toWorld(
        angle,
        ATTACHMENT_DX,
        -(ATTACHMENT_DZ + index * ATTACHMENT_FAN_DZ + slide),
        0,
      );
      layout.placements.push({
        ...permanentPlacement(permanent, seat, 'attachment', 0, 0, 0),

        yaw: hostSeat?.yaw ?? 0,
        position: {
          x: host.position.x + offset.x,
          y: host.position.y - (1.5 + index) * LAYER_STEP,
          z: host.position.z + offset.z,
        },
        scale: ATTACHMENT_SCALE,
      });
    });
  }
}

export function layoutCombat(
  seats: Seat[],
  metrics: SeatMetrics,
  combat: CombatIndex,
  raised: ReadonlySet<string>,
  layout: BoardLayout,
): void {
  const battlefield = battlefieldIndex(seats);
  const attackAngle = attackingAngle(seats, combat);

  const targets = combat.groups.map((group) => combatTarget(group, seats, layout));

  const pulls = combat.groups.map((group, index) =>
    group.blockers.some((objectId) => battlefield.has(objectId))
      ? 0
      : acrossIn(attackAngle, targets[index].position),
  );
  const lanes = combat.groups.map((_, index) => index).sort((a, b) => pulls[a] - pulls[b] || a - b);

  const present = (objectIds: string[]) =>
    objectIds.filter((objectId) => battlefield.has(objectId));
  let claimed = 0;
  const plan = lanes.map((groupIndex) => {
    const group = combat.groups[groupIndex];
    const attackers = present(group.attackers);
    const blockers = present(group.blockers);
    const width = Math.max(1, attackers.length, blockers.length);
    const start = claimed;
    claimed += width;
    return { groupIndex, attackers, blockers, width, start };
  });

  const columns = Math.max(1, claimed);
  const extent = Math.max(0, metrics.combatLaneW - CARD_W);
  const step = spreadStep(columns, extent, CARD_W + ROW_GAP);

  const rows = {
    attacker: plan.flatMap((entry) => entry.attackers),
    blocker: plan.flatMap((entry) => entry.blockers),
  };
  const lifted = {
    attacker: raisedIn(rows.attacker, raised),
    blocker: raisedIn(rows.blocker, raised),
  };
  const placedSoFar = { attacker: 0, blocker: 0 };

  for (const entry of plan) {
    const place = (objectIds: string[], kind: 'attacker' | 'blocker'): Vec3[] =>
      objectIds.map((objectId, index) => {
        const found = battlefield.get(objectId)!;
        const row = placedSoFar[kind]++;

        const column = entry.start + (entry.width - 1) / 2 + (index - (objectIds.length - 1) / 2);
        const at =
          (column - (columns - 1) / 2) * step + part(row, lifted[kind], step, CARD_W + ROW_GAP);

        const lx = clampTo(extent / 2, at) * facing(found.seat.angle, attackAngle);
        const placement = permanentPlacement(
          found.permanent,
          found.seat,
          kind,
          lx,
          metrics.combatZ,
          row,
        );
        layout.placements.push(placement);
        return placement.position;
      });

    const group = combat.groups[entry.groupIndex];
    const attackerPositions = place(entry.attackers, 'attacker');
    const blockerPositions = place(entry.blockers, 'blocker');
    if (!attackerPositions.length) continue;

    if (blockerPositions.length) {
      for (const from of attackerPositions) {
        for (const to of blockerPositions) layout.arrows.push({ from, to, blocked: true });
      }
      continue;
    }

    const target = targets[entry.groupIndex];
    for (const from of attackerPositions) {
      layout.arrows.push({
        from,
        to: target.permanent
          ? stopShortOf(from, target.position, BOARD_CARD_H / 2 + 0.06)
          : target.position,
        blocked: group.blocked,
      });
    }
  }
}

function combatTarget(
  group: CombatIndex['groups'][number],
  seats: Seat[],
  layout: BoardLayout,
): { position: Vec3; permanent: boolean } {
  const defender = group.defenderObjectId
    ? layout.placements.find((placement) => placement.objectId === group.defenderObjectId)
    : undefined;
  if (defender) return { position: defender.position, permanent: true };

  const defenderSeat = group.defenderSeat === null ? null : seats[group.defenderSeat];
  return {
    position: defenderSeat
      ? seatPoint(defenderSeat, 0, BACK_Z + PLAYER_TARGET_GAP, TABLE_Y)
      : { x: 0, y: TABLE_Y, z: 0 },
    permanent: false,
  };
}

function attackingAngle(seats: Seat[], combat: CombatIndex): number {
  for (const role of combat.roles.values()) {
    if (role.role === 'attacker') return seats[role.seat]?.angle ?? 0;
  }
  return 0;
}

function facing(seatAngle: number, attackAngle: number): 1 | -1 {
  return Math.cos(seatAngle - attackAngle) < 0 ? -1 : 1;
}
