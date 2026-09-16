export const AVATAR_HUES = [291, 55, 200, 340, 148, 25] as const;

export function avatarColor(hue: number): string {
  return `oklch(0.6 0.17 ${hue})`;
}

export function accentHueFor(name: string): number {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
}

export function accentFor(name: string): string {
  return avatarColor(accentHueFor(name));
}

export function initialsFor(name: string): string {
  const words = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.[0] ?? '?').toUpperCase();
}
