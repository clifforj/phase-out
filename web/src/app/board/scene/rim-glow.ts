import { CanvasTexture, NoColorSpace } from 'three';
import { jitter, makeCanvas, paintBlob } from './canvas';
import { MOTION_ALLOWED } from './motion';

const SIZE = 128;

interface Octave {
  count: number;
  sizeRange: readonly [number, number];
  alphaRange: readonly [number, number];

  insetRange: readonly [number, number];

  drift: number;
}

const OCTAVES: readonly Octave[] = [
  {
    count: 7,
    sizeRange: [0.095, 0.125],
    alphaRange: [0.55, 0.56],
    insetRange: [0.154, 0.133],
    drift: 0,
  },
  {
    count: 14,
    sizeRange: [0.095, 0.076],
    alphaRange: [0.3, 0.65],
    insetRange: [0.138, 0.13],
    drift: -0.02,
  },
];

const CENTRAL_GLOW = { alpha: 0.87, size: 0.83, blur: 0.02 };

const PULSE_AMOUNT = 0.41;
const PULSE_SPEED = 0.33;

const CORNER_FRAC = 0.055;

const REPAINT_INTERVAL = 1 / 15;

const MASK_FLOOR = 90;

function roundedRectPoint(
  frac: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
): { x: number; y: number } {
  const w = x1 - x0;
  const h = y1 - y0;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const straightW = w - 2 * rr;
  const straightH = h - 2 * rr;
  const arcLen = (Math.PI / 2) * rr;
  const segments = [straightW, arcLen, straightH, arcLen, straightW, arcLen, straightH, arcLen];
  const total = segments.reduce((a, b) => a + b, 0) || 1;
  let d = (((frac % 1) + 1) % 1) * total;

  if (d < segments[0]) return { x: x0 + rr + d, y: y0 };
  d -= segments[0];
  if (d < segments[1]) {
    const a = -Math.PI / 2 + (d / segments[1]) * (Math.PI / 2);
    return { x: x1 - rr + rr * Math.cos(a), y: y0 + rr + rr * Math.sin(a) };
  }
  d -= segments[1];
  if (d < segments[2]) return { x: x1, y: y0 + rr + d };
  d -= segments[2];
  if (d < segments[3]) {
    const a = (d / segments[3]) * (Math.PI / 2);
    return { x: x1 - rr + rr * Math.cos(a), y: y1 - rr + rr * Math.sin(a) };
  }
  d -= segments[3];
  if (d < segments[4]) return { x: x1 - rr - d, y: y1 };
  d -= segments[4];
  if (d < segments[5]) {
    const a = Math.PI / 2 + (d / segments[5]) * (Math.PI / 2);
    return { x: x0 + rr + rr * Math.cos(a), y: y1 - rr + rr * Math.sin(a) };
  }
  d -= segments[5];
  if (d < segments[6]) return { x: x0, y: y1 - rr - d };
  d -= segments[6];
  const a = Math.PI + (d / segments[7]) * (Math.PI / 2);
  return { x: x0 + rr + rr * Math.cos(a), y: y0 + rr + rr * Math.sin(a) };
}

function paintCentralGlow(ctx: CanvasRenderingContext2D): void {
  const side = SIZE * CENTRAL_GLOW.size;
  const blurPx = SIZE * CENTRAL_GLOW.blur;
  ctx.save();
  ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
  ctx.fillStyle = `rgba(255, 255, 255, ${CENTRAL_GLOW.alpha})`;
  ctx.fillRect((SIZE - side) / 2, (SIZE - side) / 2, side, side);
  ctx.restore();
}

function paintMask(ctx: CanvasRenderingContext2D, time: number): void {
  const { canvas, ctx: mctx } = makeCanvas(SIZE, SIZE);
  if (!mctx) return;
  mctx.fillStyle = `rgb(${MASK_FLOOR}, ${MASK_FLOOR}, ${MASK_FLOOR})`;
  mctx.fillRect(0, 0, SIZE, SIZE);
  mctx.globalCompositeOperation = 'lighter';

  const seed = 71.3;
  const count = 11;
  const driftPhase = (((0.015 * time) % 1) + 1) % 1;
  for (let i = 0; i < count; i++) {
    const t = ((i / count + driftPhase) % 1) * Math.PI * 2;
    const cx = 0.5 + 0.42 * Math.cos(t + i * 2.1) * jitter(seed, i, 1.3);
    const cy = 0.5 + 0.42 * Math.sin(t + i * 2.1) * Math.abs(Math.cos(seed + i * 1.7));
    const radius = SIZE * (0.16 + 0.14 * jitter(seed * 1.4, i, 2.6));
    paintBlob(mctx, cx * SIZE, cy * SIZE, radius, 0.5 + 0.5 * jitter(seed * 2.1, i, 3.3));
  }

  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(canvas, 0, 0);
}

function paintOctave(
  ctx: CanvasRenderingContext2D,
  octave: Octave,
  seed: number,
  time: number,
): void {
  const driftPhase = (((octave.drift * time) % 1) + 1) % 1;
  for (let i = 0; i < octave.count; i++) {
    const frac = (((i / octave.count + driftPhase) % 1) + 1) % 1;
    const [insetMin, insetMax] = octave.insetRange;
    const inset = insetMin + (insetMax - insetMin) * jitter(seed * 2.2, i, 1.1);
    const pt = roundedRectPoint(frac, inset, inset, 1 - inset, 1 - inset, CORNER_FRAC);

    const [minSize, maxSize] = octave.sizeRange;
    const radius = SIZE * (minSize + (maxSize - minSize) * jitter(seed * 1.9, i, 1.3));
    if (radius <= 0) continue;

    const [minAlpha, maxAlpha] = octave.alphaRange;
    let alpha = minAlpha + (maxAlpha - minAlpha) * jitter(seed * 2.6, i, 4.1);
    alpha *= 1 + PULSE_AMOUNT * Math.sin(time * PULSE_SPEED * Math.PI * 2 + seed * 4.4 + i * 1.7);
    alpha = Math.max(0, Math.min(1, alpha));
    if (alpha <= 0) continue;

    paintBlob(ctx, pt.x * SIZE, pt.y * SIZE, radius, alpha);
  }
}

export class RimGlow {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private time = 0;
  private accum = 0;

  readonly variants: readonly CanvasTexture[];

  constructor() {
    ({ canvas: this.canvas, ctx: this.ctx } = makeCanvas(SIZE, SIZE));
    this.variants = [0, 1, 2, 3].map((i) => {
      const texture = new CanvasTexture(this.canvas);

      texture.colorSpace = NoColorSpace;
      texture.center.set(0.5, 0.5);
      texture.rotation = (i * Math.PI) / 2;
      return texture;
    });
    this.paint();
  }

  variantFor(objectId: string): CanvasTexture {
    let hash = 0;
    for (let i = 0; i < objectId.length; i++) hash = (hash * 31 + objectId.charCodeAt(i)) | 0;
    return this.variants[Math.abs(hash) % this.variants.length];
  }

  private paint(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = 'lighter';
    paintCentralGlow(ctx);
    OCTAVES.forEach((octave, index) => paintOctave(ctx, octave, 5 + index * 31.7, this.time));
    paintMask(ctx, this.time);
  }

  step(dt: number, active: boolean): boolean {
    if (!MOTION_ALLOWED || !active) return false;
    this.time += dt;
    this.accum += dt;
    if (this.accum < REPAINT_INTERVAL) return false;
    this.accum -= REPAINT_INTERVAL;
    this.paint();
    for (const texture of this.variants) texture.needsUpdate = true;
    return true;
  }
}

export const rimGlow = new RimGlow();
