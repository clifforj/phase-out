import type { SeatAnchor, StackAnchor } from './scene-types';

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Half = Point;

export function stackKeepOut(anchors: readonly StackAnchor[]): Box | null {
  if (!anchors.length) return null;
  return {
    left: Math.min(...anchors.map((anchor) => anchor.left)),
    right: Math.max(...anchors.map((anchor) => anchor.right)),
    top: Math.min(...anchors.map((anchor) => anchor.top)),
    bottom: Math.max(...anchors.map((anchor) => anchor.bottom)),
  };
}

export function inflate(box: Box | null, half: Half): Box | null {
  if (!box) return null;
  return {
    left: box.left - half.x,
    right: box.right + half.x,
    top: box.top - half.y,
    bottom: box.bottom + half.y,
  };
}

export function inside(box: Box | null, point: Point): boolean {
  if (!box) return false;
  return point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom;
}

export function seatsOnTheStack(
  box: Box | null,
  anchors: readonly SeatAnchor[],
  half: Half,
): ReadonlySet<number> {
  const keepOut = inflate(box, half);
  if (!keepOut) return NO_SEATS;
  const covered = anchors.filter((anchor) => inside(keepOut, anchor));
  return covered.length ? new Set(covered.map((anchor) => anchor.seat)) : NO_SEATS;
}

const NO_SEATS: ReadonlySet<number> = new Set<number>();
