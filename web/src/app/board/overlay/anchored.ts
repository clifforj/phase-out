export function clampedLeft(x: number, insetRem: number): string {
  return `clamp(${insetRem}rem, ${x}px, calc(100% - ${insetRem}rem))`;
}

export function clampedTop(y: number, topRem: number, bottomRem: number): string {
  return `clamp(${topRem}rem, ${y}px, calc(100% - ${bottomRem}rem - var(--hand-space, 0px)))`;
}
