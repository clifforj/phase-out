import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { jitter, makeCanvas, paintBlob } from './canvas';
import { FELT, FELT_RINGS, THEME } from './theme';

function srgbTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function tableEdgeTexture(): CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  if (ctx) {
    const colour = `#${THEME.tableEdge.toString(16).padStart(6, '0')}`;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(0.8, colour);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return srgbTexture(canvas);
}

export function playmatTexture(): CanvasTexture {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size, size);
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.05,
      size / 2,
      size / 2,
      size / 2,
    );
    const stops = [0, 0.4, 0.75, 1];
    FELT.forEach((colour, index) => gradient.addColorStop(stops[index], colour));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.lineWidth = 2;
    ctx.strokeStyle = FELT_RINGS.stack;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = FELT_RINGS.boundary;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
    ctx.stroke();
  }
  return srgbTexture(canvas);
}

export const PLAYMAT_RIM_BRIGHTNESS = 0.4;

const PLAYMAT_SHADE = { full: 0.4, rim: 0.75 };

const PLAYMAT_OUTER_FEATHER = 0.04;

export function playmatShadeFactor(distance: number): number {
  if (distance <= PLAYMAT_SHADE.full) return 1;
  if (distance >= PLAYMAT_SHADE.rim) return PLAYMAT_RIM_BRIGHTNESS;
  const t = (distance - PLAYMAT_SHADE.full) / (PLAYMAT_SHADE.rim - PLAYMAT_SHADE.full);
  return 1 + (PLAYMAT_RIM_BRIGHTNESS - 1) * t;
}

function verticalGradientTexture(stops: readonly (readonly [number, string])[]): CanvasTexture {
  const { canvas, ctx } = makeCanvas(4, 128);
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 128);
    for (const [offset, colour] of stops) gradient.addColorStop(offset, colour);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  return texture;
}

export function playmatFadeTexture(): CanvasTexture {
  return verticalGradientTexture([
    [0, '#fff'],
    [1 - PLAYMAT_OUTER_FEATHER, '#fff'],
    [1, '#000'],
  ]);
}

export function playmatShadeTexture(): CanvasTexture {
  const rim = Math.round(PLAYMAT_RIM_BRIGHTNESS * 255)
    .toString(16)
    .padStart(2, '0');
  const grey = `#${rim}${rim}${rim}`;
  return verticalGradientTexture([
    [0, '#fff'],
    [PLAYMAT_SHADE.full, '#fff'],
    [PLAYMAT_SHADE.rim, grey],
    [1, grey],
  ]);
}

export function centreMatFadeTexture(innerFraction: number): CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, half * innerFraction, half, half, half);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, '#000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

const PLAYMAT_IMAGE_ASPECT = 2;

export function playmatImageTexture(image: HTMLImageElement): CanvasTexture {
  const height = 512;
  const width = height * PLAYMAT_IMAGE_ASPECT;
  const { canvas, ctx } = makeCanvas(width, height);
  if (ctx) {
    const aspect = image.naturalWidth / image.naturalHeight || 1;
    const drawWidth = Math.max(width, height * aspect);
    ctx.drawImage(image, (width - drawWidth) / 2, 0, drawWidth, drawWidth / aspect);
    shadePlaymatImage(ctx, width, height);
  }
  const texture = srgbTexture(canvas);
  texture.flipY = false;
  return texture;
}

function shadePlaymatImage(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const data = ctx.getImageData(0, 0, width, height);
  const pixels = data.data;
  for (let y = 0; y < height; y++) {
    const ly = y / height;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] === 0) continue;
      const factor = playmatShadeFactor(Math.hypot((x - width / 2) / height, ly));
      pixels[i] *= factor;
      pixels[i + 1] *= factor;
      pixels[i + 2] *= factor;
    }
  }
  ctx.putImageData(data, 0, 0);
}

export interface AuroraBand {
  readonly inner: number;
  readonly peak: number;
  readonly outer: number;

  readonly coreHalfWidth?: number;
}

const DEFAULT_BAND: AuroraBand = { inner: 0.714, peak: 0.86, outer: 1 };

function turbulenceMask(size: number, seed: number, peak: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  if (ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    const centre = size / 2;
    const ringRadius = size * peak;
    const octaves = [
      { count: 7, sizeRange: [0.22, 0.34], wobble: 0.09, alphaRange: [0.45, 1] },
      { count: 15, sizeRange: [0.07, 0.13], wobble: 0.05, alphaRange: [0.25, 0.7] },
    ];
    octaves.forEach((octave, octaveIndex) => {
      const octaveSeed = seed + octaveIndex * 31.7;
      for (let i = 0; i < octave.count; i++) {
        const angle = (i / octave.count) * Math.PI * 2 + octaveSeed;
        const wobble = Math.sin(octaveSeed * 3 + i * 2.7) * size * octave.wobble;
        const x = centre + Math.cos(angle) * (ringRadius + wobble);
        const y = centre + Math.sin(angle) * (ringRadius + wobble);
        const [minSize, maxSize] = octave.sizeRange;
        const [minAlpha, maxAlpha] = octave.alphaRange;
        const radius = size * (minSize + (maxSize - minSize) * jitter(octaveSeed * 1.9, i, 1.3));
        paintBlob(
          ctx,
          x,
          y,
          radius,
          minAlpha + (maxAlpha - minAlpha) * jitter(octaveSeed * 2.6, i, 4.1),
        );
      }
    });
  }
  return canvas;
}

function auroraCore(
  stops: ReadonlyArray<readonly [number, string]>,
  size: number,
  peak: number,
  halfWidth: number,
): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  if (ctx) {
    paintConic(ctx, stops, size);
    ctx.globalCompositeOperation = 'destination-in';
    paintRadialBand(ctx, size, Math.max(0, peak - halfWidth), peak, Math.min(1, peak + halfWidth));
  }
  return canvas;
}

function paintConic(
  ctx: CanvasRenderingContext2D,
  stops: ReadonlyArray<readonly [number, string]>,
  size: number,
): void {
  const conic = ctx.createConicGradient(0, size / 2, size / 2);
  for (const [offset, colour] of stops) conic.addColorStop(offset, colour);
  ctx.fillStyle = conic;
  ctx.fillRect(0, 0, size, size);
}

function paintRadialBand(
  ctx: CanvasRenderingContext2D,
  size: number,
  inner: number,
  peak: number,
  outer: number,
): void {
  const half = size / 2;
  const mask = ctx.createRadialGradient(half, half, 0, half, half, half);
  mask.addColorStop(0, 'rgba(255, 255, 255, 0)');
  mask.addColorStop(inner, 'rgba(255, 255, 255, 0)');
  mask.addColorStop(peak, 'rgba(255, 255, 255, 1)');
  mask.addColorStop(outer, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
}

export function auroraTexture(
  stops: ReadonlyArray<readonly [number, string]>,
  seed: number,
  band: AuroraBand = DEFAULT_BAND,
): CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  if (ctx) {
    paintConic(ctx, stops, size);
    ctx.globalCompositeOperation = 'destination-in';
    paintRadialBand(ctx, size, band.inner, band.peak, band.outer);
    ctx.drawImage(turbulenceMask(size, seed, band.peak), 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(auroraCore(stops, size, band.peak, band.coreHalfWidth ?? 0.08), 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const texture = srgbTexture(canvas);
  texture.center.set(0.5, 0.5);
  return texture;
}

function arrowTurbulence(width: number, height: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(width, height);
  if (ctx) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    const octaves = [
      { count: 10, sizeRange: [0.14, 0.24], alphaRange: [0.45, 1] },
      { count: 18, sizeRange: [0.045, 0.09], alphaRange: [0.25, 0.7] },
    ];
    octaves.forEach((octave, octaveIndex) => {
      const seed = octaveIndex * 19.1 + 6;
      for (let i = 0; i < octave.count; i++) {
        const x = (i / octave.count) * width;
        const y = height / 2 + Math.sin(seed * 4 + i * 1.9) * height * 0.32;
        const [minSize, maxSize] = octave.sizeRange;
        const [minAlpha, maxAlpha] = octave.alphaRange;
        const radius = width * (minSize + (maxSize - minSize) * jitter(seed * 1.7, i, 1.3));
        const alpha = minAlpha + (maxAlpha - minAlpha) * jitter(seed * 2.6, i, 3.1);
        for (const dx of [-width, 0, width]) paintBlob(ctx, x + dx, y, radius, alpha);
      }
    });
  }
  return canvas;
}

export function arrowGlowTexture(): CanvasTexture {
  const width = 256;
  const height = 64;
  const { canvas, ctx } = makeCanvas(width, height);
  if (ctx) {
    const band = ctx.createLinearGradient(0, 0, 0, height);
    band.addColorStop(0, 'rgba(255, 255, 255, 0)');
    band.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
    band.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(arrowTurbulence(width, height), 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  const texture = srgbTexture(canvas);
  texture.wrapS = RepeatWrapping;
  return texture;
}
