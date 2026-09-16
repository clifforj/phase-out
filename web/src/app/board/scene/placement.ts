import type { CardView, PermanentStateView } from '../../core/protocol';
import type { BoardLayout, Placement, SlotKind, Vec3, ZoneMarker } from './layout';
import {
  BOARD_CARD_H,
  CARD_THICKNESS,
  CARD_W,
  COMMAND_MAX_D,
  COMMAND_Z,
  LAND_PILE_FAN_MAX_COSMETIC,
  LAND_PILE_FAN_MAX_CREDIT,
  LAND_PILE_STEP_COSMETIC,
  LAND_PILE_STEP_CREDIT,
  LAND_SCALE,
  LAYER_STEP,
  PILE_AREA_H,
  PILE_AREA_W,
  PILE_DEPTH,
  PILE_SCALE,
  PILE_Z,
  ROW_GAP,
  ROW_Z,
  SUPPORT_MAX_D,
  SUPPORT_Z,
  TABLE_Y,
  ZONE_LABEL_GAP,
} from './sizes';

const stackStep = (scale: number): number => CARD_THICKNESS * scale;
import type { AttachmentIndex, CombatIndex } from './combat-layout';
import type { Seat, SeatMetrics } from './seat-metrics';
import { seatPoint, toWorld } from './seat-metrics';
import { clampTo, fanOffset, line, raisedIn, rowFor, rowX, spread } from './spacing';

const STACK_X = -2.6;
const STACK_Y = 0;
const STACK_DISTANCE = 7.4;

const STACK_SPACING = 0.32;
const STACK_SCALE = 1.55;

const HAND_DISTANCE = 8.6;
const HAND_PITCH = 0.78;
const HAND_MAX_FAN = 6.6;

const TAPPED_SPIN = -Math.PI / 6;

function tableCard(
  card: CardView,
  seat: Seat,
  kind: SlotKind,
  position: Vec3,
  extra: Partial<Placement> = {},
): Placement {
  return {
    objectId: card.objectId,
    card,
    permanent: null,
    seat: seat.index,
    kind,
    position,
    spin: 0,
    yaw: seat.yaw,
    tilt: 0,
    space: 'table',
    scale: 1,
    tapped: false,
    faded: false,
    ...extra,
  };
}

function cameraCard(
  card: CardView,
  seat: number,
  kind: SlotKind,
  position: Vec3,
  extra: Partial<Placement> = {},
): Placement {
  return {
    objectId: card.objectId,
    card,
    permanent: null,
    seat,
    kind,
    position,
    spin: 0,
    yaw: 0,
    tilt: 0,
    space: 'camera',
    scale: 1,
    tapped: false,
    faded: false,
    ...extra,
  };
}

export function permanentPlacement(
  permanent: PermanentStateView,
  seat: Seat,
  kind: SlotKind,
  lx: number,
  outward: number,
  layer: number,
): Placement {
  return tableCard(
    permanent.card,
    seat,
    kind,
    toWorld(seat.angle, lx, outward, TABLE_Y + layer * LAYER_STEP),
    {
      permanent,
      spin: permanent.tapped ? TAPPED_SPIN : 0,
      tapped: permanent.tapped,
      faded: !permanent.phasedIn,
    },
  );
}

export function layoutSeat(
  seat: Seat,
  metrics: SeatMetrics,
  combat: CombatIndex,
  attachments: AttachmentIndex,
  raised: ReadonlySet<string>,
  layout: BoardLayout,
): void {
  const groups: Record<'land' | 'creature' | 'permanent', PermanentStateView[]> = {
    land: [],
    creature: [],
    permanent: [],
  };
  for (const permanent of seat.player.battlefield) {
    if (combat.roles.has(permanent.card.objectId)) continue;
    if (attachments.attached.has(permanent.card.objectId)) continue;
    groups[rowFor(permanent.card.typeLine ?? '')].push(permanent);
  }

  const creatures = groups.creature;
  const liftedCreatures = raisedIn(
    creatures.map((permanent) => permanent.card.objectId),
    raised,
  );
  creatures.forEach((permanent, index) => {
    const lx = rowX(creatures.length, index, metrics.rowMaxW, liftedCreatures);
    layout.placements.push(
      permanentPlacement(permanent, seat, 'creature', lx, seat.ring + ROW_Z.creature, index),
    );
  });

  layoutLandRow(groups.land, seat, metrics, raised, layout);

  const support = groups.permanent;
  const liftedSupport = raisedIn(
    support.map((permanent) => permanent.card.objectId),
    raised,
  );
  support.forEach((permanent, index) => {
    const lz =
      SUPPORT_Z + line(support.length, index, liftedSupport, SUPPORT_MAX_D, BOARD_CARD_H + ROW_GAP);
    layout.placements.push(
      permanentPlacement(permanent, seat, 'permanent', metrics.supportX, seat.ring + lz, index),
    );
  });

  const commanders = seat.player.commandZone.filter((object) => object.card);
  const liftedCommand = raisedIn(
    commanders.map((object) => object.objectId),
    raised,
  );
  commanders.forEach((object, index) => {
    const lz =
      COMMAND_Z +
      line(
        commanders.length,
        index,
        liftedCommand,
        COMMAND_MAX_D,
        BOARD_CARD_H * PILE_SCALE + ROW_GAP,
      );
    layout.placements.push(
      tableCard(
        object.card!,
        seat,
        'command',
        seatPoint(seat, metrics.commandX, lz, TABLE_Y + index * LAYER_STEP),
        {
          objectId: object.objectId,
          scale: PILE_SCALE,
        },
      ),
    );
  });

  layoutPile(seat, seat.player.graveyard, metrics.graveyardX, layout);
  layout.zones.push(zoneMarker(seat, metrics, seat.player.graveyard.length));
  layoutTopCard(seat, metrics, layout);
}

function layoutLandRow(
  lands: PermanentStateView[],
  seat: Seat,
  metrics: SeatMetrics,
  raised: ReadonlySet<string>,
  layout: BoardLayout,
): void {
  const piles = landPiles(lands);
  const pileRaised: number[] = [];
  piles.forEach((pile, index) => {
    if (pile.some((permanent) => raised.has(permanent.card.objectId))) pileRaised.push(index);
  });
  const acrossReach = (pile: PermanentStateView[]) =>
    pile[0].tapped
      ? fanOffset(pile.length - 1, LAND_PILE_FAN_MAX_CREDIT, LAND_PILE_STEP_CREDIT)
      : fanOffset(pile.length - 1, LAND_PILE_FAN_MAX_COSMETIC, LAND_PILE_STEP_COSMETIC);
  const widestFan = piles.reduce((max, pile) => Math.max(max, acrossReach(pile)), 0);
  const pileStep = CARD_W + ROW_GAP + widestFan;
  const landExtent = Math.max(0, metrics.rowMaxW - CARD_W - 2 * widestFan);
  const halfExtent = (metrics.rowMaxW - CARD_W) / 2;

  piles.forEach((pile, pileIndex) => {
    const lx = line(piles.length, pileIndex, pileRaised, landExtent, pileStep);
    const pileId = `${seat.index}:${producedMana(pile[0].card)}:${pile[0].tapped}`;
    pile.forEach((permanent, cardIndex) => {
      const depthLayer = pile.length - 1 - cardIndex;
      layout.placements.push(
        landPlacement(
          permanent,
          seat,
          lx,
          seat.ring + ROW_Z.land,
          cardIndex,
          depthLayer,
          halfExtent,
          pileId,
          pileIndex,
        ),
      );
    });
  });
}

function layoutTopCard(seat: Seat, metrics: SeatMetrics, layout: BoardLayout): void {
  const card = seat.player.topCard;
  if (!card) return;
  const position = seatPoint(
    seat,
    metrics.graveyardX,
    PILE_Z,
    TABLE_Y + PILE_DEPTH * stackStep(PILE_SCALE),
  );
  layout.placements.push(tableCard(card, seat, 'library', position, { scale: PILE_SCALE }));
}

function layoutPile(seat: Seat, cards: CardView[], lx: number, layout: BoardLayout): void {
  cards.slice(-PILE_DEPTH).forEach((card, index) => {
    const position = seatPoint(
      seat,
      lx + index * 0.035 * PILE_SCALE,
      PILE_Z - index * 0.03 * PILE_SCALE,
      TABLE_Y + index * stackStep(PILE_SCALE),
    );
    layout.placements.push(tableCard(card, seat, 'graveyard', position, { scale: PILE_SCALE }));
  });
}

function zoneMarker(seat: Seat, metrics: SeatMetrics, count: number): ZoneMarker {
  const outward = -(PILE_AREA_W / 2 + ZONE_LABEL_GAP);
  return {
    seat: seat.index,
    kind: 'graveyard',
    angle: seat.angle,
    position: seatPoint(seat, metrics.graveyardX, PILE_Z, 0),
    width: PILE_AREA_W,
    height: PILE_AREA_H,
    labelPosition: seatPoint(seat, metrics.graveyardX + outward, PILE_Z, 0),
    count,
  };
}

export function layoutStack(stack: CardView[], layout: BoardLayout): void {
  const spacing = Math.min(STACK_SPACING, 2.8 / Math.max(1, stack.length));
  const middle = (stack.length - 1) / 2;
  [...stack].reverse().forEach((card, index) => {
    const position = { x: STACK_X + (index - middle) * spacing, y: STACK_Y, z: -STACK_DISTANCE };
    layout.placements.push(cameraCard(card, -1, 'stack', position, { scale: STACK_SCALE }));
  });
}

export function layoutHand(hand: CardView[], seats: Seat[], layout: BoardLayout): void {
  if (!hand.length) return;
  const seat = seats.findIndex((candidate) => candidate.player.isMe);
  hand.forEach((card, index) => {
    const position = {
      x: spread(hand.length, index, HAND_MAX_FAN, HAND_PITCH),
      y: 0,
      z: -HAND_DISTANCE,
    };
    layout.placements.push(cameraCard(card, seat, 'hand', position, { anchor: 'bottom' }));
  });
}

const BASIC_LAND_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];

export function producedMana(card: CardView): string {
  const typeLine = card.typeLine ?? '';
  const basic = BASIC_LAND_TYPES.find((type) => typeLine.includes(type));
  if (basic) return basic;
  return `card:${card.rules.join('|')}`;
}

export function landPiles(row: PermanentStateView[]): PermanentStateView[][] {
  const order: string[] = [];
  const untapped = new Map<string, PermanentStateView[]>();
  const tapped = new Map<string, PermanentStateView[]>();
  for (const permanent of row) {
    const key = producedMana(permanent.card);
    if (!untapped.has(key) && !tapped.has(key)) order.push(key);
    const bucket = permanent.tapped ? tapped : untapped;
    bucket.set(key, [...(bucket.get(key) ?? []), permanent]);
  }
  return order.flatMap((key) =>
    [tapped.get(key), untapped.get(key)].filter((pile): pile is PermanentStateView[] => !!pile),
  );
}

export function seatFlipped(seat: Seat): boolean {
  return Math.cos(seat.yaw - seat.angle) < 0;
}

function landPlacement(
  permanent: PermanentStateView,
  seat: Seat,
  lx: number,
  outward: number,
  cardIndex: number,
  layer: number,
  halfExtent: number,
  pileId: string,
  pileIndex: number,
): Placement {
  const flipped = seatFlipped(seat);
  const acrossMagnitude = permanent.tapped
    ? fanOffset(cardIndex, LAND_PILE_FAN_MAX_CREDIT, LAND_PILE_STEP_CREDIT)
    : fanOffset(cardIndex, LAND_PILE_FAN_MAX_COSMETIC, LAND_PILE_STEP_COSMETIC);
  const acrossFan = (permanent.tapped ? -1 : 1) * (flipped ? -1 : 1) * acrossMagnitude;

  const forwardMax = permanent.tapped ? LAND_PILE_FAN_MAX_COSMETIC : LAND_PILE_FAN_MAX_CREDIT;
  const forwardStep = permanent.tapped ? LAND_PILE_STEP_COSMETIC : LAND_PILE_STEP_CREDIT;
  const forwardRaw = fanOffset(cardIndex, forwardMax, forwardStep);
  const forwardFan = flipped ? forwardMax - forwardRaw : forwardRaw;

  const y = TABLE_Y + pileIndex * LAYER_STEP + layer * stackStep(LAND_SCALE);
  const position = toWorld(
    seat.angle,
    clampTo(halfExtent, lx + acrossFan),
    outward + forwardFan,
    y,
  );
  return tableCard(permanent.card, seat, 'land', position, {
    permanent,
    spin: permanent.tapped ? TAPPED_SPIN : 0,
    scale: LAND_SCALE,
    tapped: permanent.tapped,
    faded: !permanent.phasedIn,
    pileId,
  });
}

export function stopShortOf(from: Vec3, to: Vec3, gap: number): Vec3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length <= gap) return to;
  const scale = (length - gap) / length;
  return { x: from.x + dx * scale, y: to.y, z: from.z + dz * scale };
}
