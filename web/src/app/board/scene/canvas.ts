export interface Canvas2d {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
}

export function makeCanvas(width: number, height: number): Canvas2d {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function paintBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  const blob = ctx.createRadialGradient(x, y, 0, x, y, radius);
  blob.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  blob.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = blob;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function jitter(seed: number, index: number, scale = 1): number {
  return Math.abs(Math.sin(seed + index * scale));
}
