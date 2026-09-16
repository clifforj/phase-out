import type { Vec3 } from './layout';
import { CARD_W, ROW_GAP, ROW_MAX_W } from './sizes';

const PART_SHARE = 0.55;
const PART_REACH = 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampTo(limit: number, at: number): number {
  return clamp(at, -limit, limit);
}

export function spreadStep(count: number, maxExtent: number, step: number): number {
  return count <= 1 ? step : Math.min(step, maxExtent / (count - 1));
}

export function spread(count: number, index: number, maxExtent: number, step: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * spreadStep(count, maxExtent, step);
}

export function part(index: number, raised: number[], spacing: number, step: number): number {
  const hidden = Math.max(0, step - spacing);
  if (!hidden) return 0;
  let offset = 0;
  for (const other of raised) {
    if (other === index) continue;
    const gap = index - other;
    const falloff = Math.max(0, 1 - (Math.abs(gap) - 1) / PART_REACH);
    offset += Math.sign(gap) * hidden * PART_SHARE * falloff;
  }
  return offset;
}

export function line(
  count: number,
  index: number,
  raised: number[],
  maxExtent: number,
  step: number,
): number {
  const at =
    spread(count, index, maxExtent, step) +
    part(index, raised, spreadStep(count, maxExtent, step), step);
  return clampTo(maxExtent / 2, at);
}

export function raisedIn(objectIds: string[], raised: ReadonlySet<string>): number[] {
  if (!raised.size) return [];
  const found: number[] = [];
  objectIds.forEach((objectId, index) => {
    if (raised.has(objectId)) found.push(index);
  });
  return found;
}

export function rowX(
  count: number,
  index: number,
  maxWidth = ROW_MAX_W,
  raised: number[] = [],
): number {
  return line(count, index, raised, Math.max(0, maxWidth - CARD_W), CARD_W + ROW_GAP);
}

export function rowFor(typeLine: string): 'land' | 'creature' | 'permanent' {
  const type = typeLine.toLowerCase();

  if (type.includes('creature')) return 'creature';
  if (type.includes('land')) return 'land';
  return 'permanent';
}

export function acrossIn(angle: number, point: Vec3): number {
  return point.x * Math.cos(angle) - point.z * Math.sin(angle);
}

export function fanOffset(index: number, maxExtent: number, step: number): number {
  return Math.min(index * step, maxExtent);
}
