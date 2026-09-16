import { clamp } from './spacing';

export const PIVOT_HEIGHT = 0.7;

const FIELD_FAR = 7.1;
const FIELD_NEAR = 4.8;

export function fieldShare(distance: number, boardScale = 1): number {
  const scaled = distance / Math.max(boardScale, 0.001);
  const t = (FIELD_FAR - scaled) / (FIELD_FAR - FIELD_NEAR);
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function pivotZ(distance: number, tableZ: number, fieldZ: number, boardScale = 1): number {
  return tableZ + (fieldZ - tableZ) * fieldShare(distance, boardScale);
}
