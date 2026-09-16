import { MathUtils, Vector3 } from 'three';
import type { CameraRig } from './camera-rig';
import type { Vec3 } from './layout';
import { MOVE_LAMBDA, type CardObject } from './card-object';
import { CARD_H, CARD_W } from './sizes';

export interface AnchoredCard {
  card: CardObject;

  offset: Vec3;
  scale: number;
  lifted: boolean;

  index: number;
}

interface HandEntry {
  progress: number;

  leaving: boolean;

  parked: boolean;

  arc: boolean;

  seeded: boolean;
}

const scratch = new Vector3();

const ANCHOR_DEPTH_STEP = 0.22;

const STACK_CURL_X = 0.14;
const STACK_CURL_ROLL = 0.09;
const STACK_CURL_MAX = 4;

const HAND_DEPTH_STEP = 0.012;
const HAND_HOVER_SCALE = 1.3;

const HAND_CARD_FRACTION = 1.4;
const HAND_TOP_GAP = 0.08;

const HAND_REVEAL_GAP = 0.08;

const HAND_CURVE_DROOP = 0.24;
const HAND_CURVE_ROLL = 0.16;

const HAND_PART_WIDTH = 0.42;
const HAND_PART_REACH = 3;

const HAND_ENTRY_REACH = 1.8;
const HAND_ENTRY_DROP = 1.25;
const HAND_ENTRY_ROLL = 0.22;
const HAND_ENTRY_DEPTH = 0.45;
const HAND_ENTRY_LAMBDA = 6.5;
const HAND_ENTRY_DONE = 0.004;

const HAND_EXIT_DONE = 0.95;

const ANCHOR_RENDER_BASE = 100;
const STACK_RENDER_BASE = 200;

export class HandAnimator {
  readonly stackCards: AnchoredCard[] = [];

  readonly handCards: AnchoredCard[] = [];

  private readonly handLeaving: AnchoredCard[] = [];

  private readonly handLift = new Map<string, number>();
  private readonly handEntry = new Map<string, HandEntry>();

  private handIds = new Set<string>();

  private handBandPixels = 0;

  constructor(
    private readonly rig: CameraRig,
    private readonly invalidate: () => void,
  ) {}

  beginSnapshot(): Map<string, AnchoredCard> {
    this.stackCards.length = 0;
    const wasHand = new Map(this.handCards.map((anchored) => [anchored.card.objectId, anchored]));
    this.handCards.length = 0;
    return wasHand;
  }

  place(
    card: CardObject,
    offset: Vec3,
    scale: number,
    lifted: boolean,
    anchor: 'centre' | 'bottom',
    fromNothing: boolean,
  ): void {
    const group = anchor === 'bottom' ? this.handCards : this.stackCards;
    group.push({ card, offset, scale, lifted, index: group.length });
    if (anchor === 'bottom' && !this.handIds.has(card.objectId)) {
      this.handEntry.set(card.objectId, {
        progress: 1,
        leaving: false,
        parked: false,
        arc: fromNothing,
        seeded: false,
      });
    }
  }

  beginExit(card: CardObject, held: AnchoredCard): void {
    card.leaving = true;
    const flight = this.handEntry.get(card.objectId);
    if (flight) {
      flight.leaving = true;
      flight.parked = false;
      flight.arc = true;
      flight.seeded = true;
    } else {
      this.handEntry.set(card.objectId, {
        progress: 0,
        leaving: true,
        parked: false,
        arc: true,
        seeded: true,
      });
    }

    this.handLeaving.push({ ...held, lifted: false });
  }

  get hasParked(): boolean {
    return this.handLeaving.length > 0;
  }

  retireParked(): void {
    for (const anchored of this.handLeaving) {
      this.handEntry.delete(anchored.card.objectId);
      anchored.card.retire();
    }
    this.handLeaving.length = 0;
  }

  endSnapshot(): void {
    this.handCards.push(...this.handLeaving);
    this.handIds = new Set(this.handCards.map((anchored) => anchored.card.objectId));
  }

  stopHandExit(card: CardObject, returning: boolean): void {
    const exit = this.handEntry.get(card.objectId);
    if (!exit?.leaving) return;
    const at = this.handLeaving.findIndex((anchored) => anchored.card === card);
    if (at >= 0) this.handLeaving.splice(at, 1);
    if (!returning) {
      this.handEntry.delete(card.objectId);
      return;
    }
    exit.leaving = false;
    exit.parked = false;
    exit.arc = true;
    exit.seeded = true;
  }

  placeAnchoredCards(dt: number): void {
    if (!this.stackCards.length && !this.handCards.length) return;
    const { camera, controls } = this.rig;
    camera.updateMatrixWorld();
    const reach = Math.max(2.6, controls.getDistance() - 1.4);
    this.placeHand(reach, dt);

    const topIndex = this.stackCards.length - 1;
    this.stackCards.forEach((anchored, index) => {
      const nominalDistance = -anchored.offset.z;
      const clampedDistance = Math.min(nominalDistance, reach);

      const distance = clampedDistance - index * ANCHOR_DEPTH_STEP;

      const zoomScale = clampedDistance / nominalDistance;

      const frameHalfHeight = Math.tan(MathUtils.degToRad(camera.fov) / 2) * nominalDistance;
      const halfHeight = frameHalfHeight * this.rig.clearFraction.y;
      const halfWidth = frameHalfHeight * camera.aspect * this.rig.clearFraction.x;
      const marginX = (CARD_W * anchored.scale) / 2 + 0.2;
      const marginY = (CARD_H * anchored.scale) / 2 + 0.2;

      const fromTop = Math.min(topIndex - index, STACK_CURL_MAX);
      const curl = fromTop * STACK_CURL_X * CARD_W * anchored.scale;
      const roll = fromTop * STACK_CURL_ROLL;

      const x = MathUtils.clamp(
        anchored.offset.x + curl,
        -(halfWidth - marginX),
        halfWidth - marginX,
      );
      const y = MathUtils.clamp(anchored.offset.y, -(halfHeight - marginY), halfHeight - marginY);
      scratch.set(x * zoomScale, y * zoomScale, -distance);
      anchored.card.anchorAt(scratch, anchored.scale * zoomScale, roll);
      anchored.card.setRenderOrder(STACK_RENDER_BASE + index);
    });
  }

  private placeHand(reach: number, dt: number): void {
    if (!this.handCards.length) return;
    const { camera } = this.rig;
    const fov = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const reachX = Math.max(...this.handCards.map((anchored) => Math.abs(anchored.offset.x)));

    this.advanceEntries(dt);

    if (!this.handLeaving.length) this.handBandPixels = this.rig.bandPixels;
    const bandPixels = this.handLeaving.length ? this.handBandPixels : this.rig.bandPixels;
    const bandFraction = (2 * bandPixels) / this.rig.framePixels;

    for (const anchored of this.handCards) {
      const id = anchored.card.objectId;
      const settling = this.handLift.get(id) ?? 0;
      this.handLift.set(id, anchored.lifted ? 1 : MathUtils.damp(settling, 0, MOVE_LAMBDA, dt));
    }

    for (const anchored of this.handCards) {
      const entry = this.handEntry.get(anchored.card.objectId);
      const arriving = entry?.progress ?? 0;
      const along = entry?.arc ? arriving : 0;

      const fan = anchored.index * HAND_DEPTH_STEP;
      const distance = Math.min(-anchored.offset.z, reach) - fan;
      const frameHalfHeight = fov * distance;
      const band = frameHalfHeight * bandFraction;
      const bottom = -frameHalfHeight * this.rig.bottomFraction;

      const scale = (band * HAND_CARD_FRACTION) / CARD_H;
      const height = CARD_H * scale;
      const width = CARD_W * scale;
      const norm = reachX > 0 ? anchored.offset.x / reachX : 0;

      let part = 0;
      for (const other of this.handCards) {
        if (other === anchored) continue;
        const otherLift = this.handLift.get(other.card.objectId) ?? 0;
        if (otherLift <= 0) continue;
        const gap = anchored.index - other.index;
        const falloff = Math.max(0, 1 - (Math.abs(gap) - 1) / HAND_PART_REACH);
        part += Math.sign(gap) * HAND_PART_WIDTH * falloff * otherLift;
      }

      const halfWidth = frameHalfHeight * camera.aspect * this.rig.clearFraction.x;
      const squeeze = Math.min(1, (halfWidth - width / 2) / Math.max(0.001, reachX * width));

      const top = bottom + band * (1 - HAND_TOP_GAP);
      const droop = anchored.lifted ? 0 : HAND_CURVE_DROOP * band * norm * norm;
      let centerY = top - height / 2 - droop;
      let liftScale = 1;
      if (anchored.lifted) {
        liftScale = HAND_HOVER_SCALE;
        const liftedHeight = height * liftScale;
        const revealed = bottom + band * HAND_REVEAL_GAP;

        centerY = Math.max(top - liftedHeight / 2, revealed + liftedHeight / 2);
      }

      scratch.set(
        (anchored.offset.x + part + HAND_ENTRY_REACH * along) * width * squeeze,
        centerY - HAND_ENTRY_DROP * band * along * along,
        -(distance - HAND_ENTRY_DEPTH * arriving),
      );
      const roll = (anchored.lifted ? 0 : -norm * HAND_CURVE_ROLL) - HAND_ENTRY_ROLL * along;
      anchored.card.anchorAt(scratch, scale * liftScale, roll);
      if (entry?.arc && !entry.seeded) {
        entry.seeded = true;
        anchored.card.anchorFrom(scratch, scale * liftScale, roll);
      }
      anchored.card.setRenderOrder(ANCHOR_RENDER_BASE + anchored.index);
    }
  }

  private advanceEntries(dt: number): void {
    const ids = new Set(this.handCards.map((anchored) => anchored.card.objectId));
    for (const id of this.handLift.keys()) {
      if (!ids.has(id)) this.handLift.delete(id);
    }
    for (const [id, entry] of this.handEntry) {
      if (!ids.has(id)) this.handEntry.delete(id);
      else if (entry.parked) continue;
      else if (entry.leaving) {
        entry.progress = MathUtils.damp(entry.progress, 1, HAND_ENTRY_LAMBDA, dt);
        if (entry.progress > HAND_EXIT_DONE) {
          entry.progress = 1;
          entry.parked = true;
        }
      } else if (!entry.arc || entry.seeded) {
        entry.progress = MathUtils.damp(entry.progress, 0, HAND_ENTRY_LAMBDA, dt);
        if (entry.progress < HAND_ENTRY_DONE) this.handEntry.delete(id);
      }
    }

    if ([...this.handEntry.values()].some((entry) => !entry.parked)) this.invalidate();
  }
}
