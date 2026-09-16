import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  ShapeGeometry,
} from 'three';
import { memoised, roundedRectShape } from './geometry';
import type { Vec3, ZoneMarker } from './layout';
import type { ZoneRef } from '../../rules/zones';
import { THEME } from './theme';

const OUTLINE_THICKNESS = 0.024;

const CORNER_RADIUS = 0.13;
const DASH_PERIOD = 0.2;
const DASH_RATIO = 0.55;

const DASH_SAMPLE = 0.03;

const PLATE_Y = 0.0025;
const OUTLINE_Y = 0.0045;

const PLATE_OPACITY = { empty: 0.3, filled: 0.42, hot: 0.62 };
const LINE_OPACITY = { empty: 0.34, filled: 0.5, hot: 1 };

const HEAT_LAMBDA = 14;
const SETTLED = 0.004;

const plateGeometries = new Map<string, ShapeGeometry>();
const outlineGeometries = new Map<string, BufferGeometry>();
const ACCENT = new Color(THEME.accent);

export class ZoneObject {
  readonly group = new Group();

  readonly plate: Mesh<ShapeGeometry, MeshBasicMaterial>;
  private readonly outline: Mesh<BufferGeometry, MeshBasicMaterial>;

  private marker: ZoneMarker;

  private heat = 0;
  private targetHeat = 0;

  constructor(marker: ZoneMarker) {
    this.marker = marker;
    const key = `${marker.width}x${marker.height}`;

    this.plate = new Mesh(
      memoised(
        plateGeometries,
        key,
        () => new ShapeGeometry(roundedRectShape(marker.width, marker.height, CORNER_RADIUS), 6),
      ),
      new MeshBasicMaterial({ color: THEME.zonePlate, transparent: true, depthWrite: false }),
    );
    this.plate.userData['zone'] = this.ref;

    this.outline = new Mesh(
      memoised(outlineGeometries, key, () =>
        dashedOutline(marker.width, marker.height, CORNER_RADIUS),
      ),
      new MeshBasicMaterial({ color: THEME.zoneLine, transparent: true, depthWrite: false }),
    );
    this.outline.raycast = () => {};

    for (const mesh of [this.plate, this.outline]) mesh.rotation.x = -Math.PI / 2;
    this.plate.position.y = PLATE_Y;
    this.outline.position.y = OUTLINE_Y;

    this.group.add(this.plate, this.outline);
    this.place(marker);
  }

  get ref(): ZoneRef {
    return { seat: this.marker.seat, kind: this.marker.kind };
  }

  get labelPosition(): Vec3 {
    return this.marker.labelPosition;
  }

  place(marker: ZoneMarker): void {
    this.marker = marker;
    this.group.position.set(marker.position.x, marker.position.y, marker.position.z);
    this.group.rotation.y = marker.angle;

    this.applyHeat();
  }

  setHot(hot: boolean): void {
    this.targetHeat = hot ? 1 : 0;
  }

  step(dt: number): boolean {
    if (Math.abs(this.heat - this.targetHeat) < SETTLED) {
      if (this.heat === this.targetHeat) return false;
      this.heat = this.targetHeat;
      this.applyHeat();
      return false;
    }
    this.heat = MathUtils.damp(this.heat, this.targetHeat, HEAT_LAMBDA, dt);
    this.applyHeat();
    return true;
  }

  private applyHeat(): void {
    const filled = this.marker.count > 0;
    const plate = filled ? PLATE_OPACITY.filled : PLATE_OPACITY.empty;
    const line = filled ? LINE_OPACITY.filled : LINE_OPACITY.empty;
    this.plate.material.opacity = MathUtils.lerp(plate, PLATE_OPACITY.hot, this.heat);
    this.outline.material.opacity = MathUtils.lerp(line, LINE_OPACITY.hot, this.heat);
    this.outline.material.color.setHex(THEME.zoneLine).lerp(ACCENT, this.heat);
  }

  dispose(): void {
    this.plate.material.dispose();
    this.outline.material.dispose();
  }
}

function roundedRectPath(width: number, height: number, radius: number): [number, number][] {
  const x = width / 2 - radius;
  const y = height / 2 - radius;
  const corners: [number, number, number][] = [
    [x, y, 0],
    [-x, y, Math.PI / 2],
    [-x, -y, Math.PI],
    [x, -y, (3 * Math.PI) / 2],
  ];
  const points: [number, number][] = [];
  for (const [cx, cy, start] of corners) {
    const steps = 5;
    for (let step = 0; step <= steps; step++) {
      const angle = start + (step / steps) * (Math.PI / 2);
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
  }
  points.push(points[0]);
  return points;
}

function dashedOutline(width: number, height: number, radius: number): BufferGeometry {
  const path = roundedRectPath(width, height, radius);
  const lengths = [0];
  for (let index = 1; index < path.length; index++) {
    lengths.push(
      lengths[index - 1] +
        Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]),
    );
  }
  const total = lengths[lengths.length - 1];

  const count = Math.max(8, Math.round(total / DASH_PERIOD));
  const period = total / count;
  const dash = period * DASH_RATIO;

  const vertices: number[] = [];
  for (let index = 0; index < count; index++) {
    const start = index * period;
    const steps = Math.max(1, Math.ceil(dash / DASH_SAMPLE));
    for (let step = 0; step < steps; step++) {
      const from = pointAt(path, lengths, start + (dash * step) / steps);
      const to = pointAt(path, lengths, start + (dash * (step + 1)) / steps);
      pushQuad(vertices, from, to, OUTLINE_THICKNESS);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  return geometry;
}

function pointAt(path: [number, number][], lengths: number[], distance: number): [number, number] {
  const total = lengths[lengths.length - 1];
  const along = MathUtils.clamp(distance, 0, total);
  let index = 1;
  while (index < lengths.length - 1 && lengths[index] < along) index++;
  const span = lengths[index] - lengths[index - 1];
  const t = span > 0 ? (along - lengths[index - 1]) / span : 0;
  const [ax, ay] = path[index - 1];
  const [bx, by] = path[index];
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

function pushQuad(
  vertices: number[],
  from: [number, number],
  to: [number, number],
  thickness: number,
): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const px = (-dy / length) * (thickness / 2);
  const py = (dx / length) * (thickness / 2);
  const a = [from[0] + px, from[1] + py, 0];
  const b = [to[0] + px, to[1] + py, 0];
  const c = [to[0] - px, to[1] - py, 0];
  const d = [from[0] - px, from[1] - py, 0];
  vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
}
