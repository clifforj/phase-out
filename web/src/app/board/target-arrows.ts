import type { StackTargetLink } from '../rules/stack-targets';
import type { Box, Point } from './keep-out';
import type { CardAnchor, SeatAnchor, StackAnchor } from './scene-types';
import { clamp } from './scene/spacing';

export type { Point } from './keep-out';

export interface TargetArrow {
  id: string;
  kind: StackTargetLink['target']['kind'];
  from: Point;
  to: Point;
}

export interface ArrowAnchors {
  stack: readonly StackAnchor[];
  cards: readonly CardAnchor[];
  seats: readonly { playerId: string; anchor: SeatAnchor | null }[];
}

const TAIL_GAP = 7;
const TARGET_GAP = 18;

const BOW_RATIO = 0.16;
const BOW_MIN = 26;
const BOW_MAX = 84;

const MIN_LENGTH = 44;
const EPSILON = 1e-6;

export function targetArrowsFor(
  links: readonly StackTargetLink[],
  anchors: ArrowAnchors,
): TargetArrow[] {
  return links.flatMap((link) => {
    const source = anchors.stack.find((anchor) => anchor.objectId === link.sourceId);
    if (!source) return [];
    const to = pointOf(link.target, anchors);
    if (!to) return [];

    return [
      {
        id: `${link.sourceId} ${targetId(link.target)}`,
        kind: link.target.kind,
        from: edgeToward(source, to),
        to,
      },
    ];
  });
}

function pointOf(target: StackTargetLink['target'], anchors: ArrowAnchors): Point | null {
  if (target.kind === 'permanent') {
    const anchor = anchors.cards.find((candidate) => candidate.objectId === target.objectId);
    return anchor?.visible ? { x: anchor.x, y: anchor.y } : null;
  }
  if (target.kind === 'player') {
    const anchor = anchors.seats.find(
      (candidate) => candidate.playerId === target.playerId,
    )?.anchor;
    return anchor?.visible ? { x: anchor.x, y: anchor.y } : null;
  }

  const anchor = anchors.stack.find((candidate) => candidate.objectId === target.objectId);
  if (!anchor) return null;
  return { x: (anchor.left + anchor.right) / 2, y: Math.max(anchor.top, anchor.bottom) };
}

function targetId(target: StackTargetLink['target']): string {
  return target.kind === 'player' ? target.playerId : target.objectId;
}

export function edgeToward(box: Box, toward: Point, gap = TAIL_GAP): Point {
  const left = Math.min(box.left, box.right);
  const right = Math.max(box.left, box.right);
  const top = Math.min(box.top, box.bottom);
  const bottom = Math.max(box.top, box.bottom);
  const centre = { x: (left + right) / 2, y: (top + bottom) / 2 };

  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  const length = Math.hypot(dx, dy);
  if (!length) return centre;

  const toSide = Math.abs(dx) > EPSILON ? (right - left) / 2 / Math.abs(dx) : Infinity;
  const toEnd = Math.abs(dy) > EPSILON ? (bottom - top) / 2 / Math.abs(dy) : Infinity;
  const reach = Math.min(toSide, toEnd) + gap / length;
  return { x: centre.x + dx * reach, y: centre.y + dy * reach };
}

export function arrowShape(from: Point, to: Point): { shaft: string; transform: string } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_LENGTH) return null;

  const bow = clamp(length * BOW_RATIO, BOW_MIN, BOW_MAX);
  const reach = length - TARGET_GAP;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return {
    shaft: `M 0 0 Q ${round(reach / 2)} ${round(bow * 2)} ${round(reach)} 0`,
    transform: `translate(${round(from.x)} ${round(from.y)}) rotate(${round(angle)})`,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
