const FONT_FAMILY = 'Mana';

const TAP_GLYPH = '';

const ARTIST_NIB_GLYPH = '';

const COUNTER_GLYPHS: Record<string, string> = {
  '+1/+1': '',
  '-1/-1': '',
  loyalty: '',
  charge: '',
  gold: '',
  ki: '',
  lore: '',
  time: '',
  doom: '',
  echo: '',
  finality: '',
  deathtouch: '',
  rad: '',
  flame: '',
  flood: '',
  fungus: '',
  mining: '',
  muster: '',
  pin: '',
  scream: '',
  slime: '',
  verse: '',
  void: '',
  vortex: '',
  shield: '',
  stun: '',
  brick: '',
  arrow: '',
  devotion: '',
  energy: '',
};

const UNEVEN_PLUS_GLYPH = '';
const UNEVEN_MINUS_GLYPH = '';
const UNEVEN_PLUS = /^\+\d+\/\+\d+$/;
const UNEVEN_MINUS = /^-\d+\/-\d+$/;

const listeners = new Set<() => void>();
let ready = false;

if (typeof document !== 'undefined' && 'fonts' in document) {
  document.fonts
    .load(`400 16px ${FONT_FAMILY}`)
    .then(() => {
      ready = true;
      listeners.forEach((listen) => listen());
    })
    .catch(() => {});
}

export function onManaFontLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function counterGlyphFor(name: string): string | null {
  const lower = name.toLowerCase();
  const exact = COUNTER_GLYPHS[lower];
  if (exact) return exact;
  if (UNEVEN_PLUS.test(lower)) return UNEVEN_PLUS_GLYPH;
  if (UNEVEN_MINUS.test(lower)) return UNEVEN_MINUS_GLYPH;
  return null;
}

export function paintManaGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
): boolean {
  if (!ready) return false;
  ctx.save();
  ctx.font = `400 ${size}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(glyph, cx, cy);
  ctx.restore();
  return true;
}

export function paintTapGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  paintManaGlyph(ctx, TAP_GLYPH, cx, cy, size, color);
}

export function paintArtistNib(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): boolean {
  return paintManaGlyph(ctx, ARTIST_NIB_GLYPH, x + size / 2, y + size / 2, size, color);
}
