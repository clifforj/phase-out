import type { ManaSymbol } from '../../rules/mana-symbol';
import { manaSymbolSvgUrl } from '../../rules/mana-symbol';
import { ImageCache } from './image-cache';

const listeners = new Set<() => void>();
const images = new ImageCache(() => listeners.forEach((listen) => listen()), true);

export function onManaSymbolImageLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function paintManaSymbol(
  ctx: CanvasRenderingContext2D,
  symbol: ManaSymbol,
  x: number,
  y: number,
  size: number,
): void {
  const image = images.get(symbol.code, manaSymbolSvgUrl(symbol.code));
  if (image) ctx.drawImage(image, x, y, size, size);
}
