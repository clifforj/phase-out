import { CARD_INK } from './theme';

export function paintBack(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = CARD_INK.back;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = CARD_INK.backPattern;
  ctx.lineWidth = 2;

  for (let i = -h; i < w; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(20, 18, 15, 0.55)';
  ctx.fillRect(0, 0, w, h);
}
