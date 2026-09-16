import { Shape } from 'three';

export function roundedRectShape(width: number, height: number, radius: number): Shape {
  const w = width / 2;
  const h = height / 2;
  const shape = new Shape();
  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h);
  shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius);
  shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h);
  shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius);
  shape.quadraticCurveTo(-w, -h, -w + radius, -h);
  return shape;
}

export function memoised<T>(cache: Map<string, T>, key: string, make: () => T): T {
  const existing = cache.get(key);
  if (existing) return existing;
  const made = make();
  cache.set(key, made);
  return made;
}
