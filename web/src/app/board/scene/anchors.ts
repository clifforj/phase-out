import { type PerspectiveCamera, Vector3 } from 'three';
import type { AnchoredCard } from './hand-animator';
import type { ZoneRef } from '../../rules/zones';
import type { Seat } from './seat-metrics';
import { CARD_H, CARD_W } from './sizes';
import type { ZoneObject } from './zone-mesh';
import type { CardObject } from './card-object';

export interface SeatAnchor {
  seat: number;
  x: number;
  y: number;

  visible: boolean;
}

export interface StackAnchor {
  objectId: string;
  y: number;
  right: number;
  left: number;
  top: number;
  bottom: number;
}

export interface CardAnchor {
  objectId: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface ZoneAnchor extends ZoneRef {
  x: number;
  y: number;
  visible: boolean;
}

export interface AnchorSet {
  seats: SeatAnchor[];
  stack: StackAnchor[];
  zones: ZoneAnchor[];
  cards: CardAnchor[];
}

export interface AnchorSources {
  seats: readonly Seat[];

  radius: number;
  stackCards: readonly AnchoredCard[];
  zones: Iterable<ZoneObject>;
  trackedIds: Iterable<string>;
  cards: ReadonlyMap<string, CardObject>;
}

const point = new Vector3();
const cameraRight = new Vector3();
const cameraUp = new Vector3();

export class AnchorPublisher {
  private lastKey = '';

  constructor(private readonly publish: (anchors: AnchorSet) => void) {}

  update(camera: PerspectiveCamera, canvas: HTMLCanvasElement, sources: AnchorSources): void {
    const rect = canvas.getBoundingClientRect();
    const toX = (value: number) => Math.round(((value + 1) / 2) * rect.width);
    const toY = (value: number) => Math.round(((1 - value) / 2) * rect.height);

    const seats: SeatAnchor[] = sources.seats.map((seat) => {
      const outward = sources.radius - 0.4;
      point.set(Math.sin(seat.angle) * outward, 0, Math.cos(seat.angle) * outward).project(camera);
      return { seat: seat.index, x: toX(point.x), y: toY(point.y), visible: point.z < 1 };
    });

    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const stack: StackAnchor[] = sources.stackCards.map((anchored) => {
      const centre = anchored.card.group.position;
      const renderedScale = anchored.card.group.scale.x;
      const halfW = (CARD_W * renderedScale) / 2;
      const halfH = (CARD_H * renderedScale) / 2;
      const edgeX = (sign: number) =>
        toX(
          point
            .copy(centre)
            .addScaledVector(cameraRight, sign * halfW)
            .project(camera).x,
        );
      const edgeY = (sign: number) =>
        toY(
          point
            .copy(centre)
            .addScaledVector(cameraUp, sign * halfH)
            .project(camera).y,
        );
      const right = edgeX(1);
      const left = edgeX(-1);
      const top = edgeY(1);
      const bottom = edgeY(-1);
      point.copy(centre).project(camera);
      return { objectId: anchored.card.objectId, y: toY(point.y), right, left, top, bottom };
    });

    const zones: ZoneAnchor[] = [];
    for (const area of sources.zones) {
      const at = area.labelPosition;
      point.set(at.x, at.y, at.z).project(camera);
      zones.push({ ...area.ref, x: toX(point.x), y: toY(point.y), visible: point.z < 1 });
    }

    const cards: CardAnchor[] = [];
    for (const objectId of sources.trackedIds) {
      const card = sources.cards.get(objectId);
      if (!card || card.leaving) continue;
      const at = card.group.position;
      point.set(at.x, at.y, at.z).project(camera);
      cards.push({ objectId, x: toX(point.x), y: toY(point.y), visible: point.z < 1 });
    }

    const key = [
      ...seats.map((anchor) => `${anchor.seat}:${anchor.x}:${anchor.y}:${anchor.visible}`),
      ...stack.map(
        (anchor) =>
          `${anchor.objectId}:${anchor.y}:${anchor.right}:${anchor.left}:${anchor.top}:${anchor.bottom}`,
      ),
      ...zones.map(
        (anchor) => `${anchor.seat}${anchor.kind}:${anchor.x}:${anchor.y}:${anchor.visible}`,
      ),
      ...cards.map((anchor) => `${anchor.objectId}:${anchor.x}:${anchor.y}:${anchor.visible}`),
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.publish({ seats, stack, zones, cards });
  }
}
