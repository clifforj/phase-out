import type { CardView, PermanentStateView } from '../../core/protocol';
import { cardDisplayName, isCommander, isCreature, isLand } from '../../rules/card-text';
import { stripTags } from '../../rules/text-format';
import { counterLabel } from '../../rules/counter-label';
import { type ManaSymbol, manaSymbol, parseManaCost, splitManaText } from '../../rules/mana-symbol';
import { type ManaLetter, producedMana } from '../../rules/mana-payment';
import { roundedRectPath } from './canvas';
import { emblemsFor, paintEmblem } from './emblem';
import { paintBack } from './paint-back';
import { counterGlyphFor, paintArtistNib, paintManaGlyph, paintTapGlyph } from './paint-mana-font';
import { paintManaSymbol } from './paint-mana-symbol';
import { BOARD_CARD_H, BOARD_CARD_W, BOARD_CREDIT_H, CARD_H, CARD_W, LAND_SCALE } from './sizes';
import { CARD_INK, frameColorsOf } from './theme';
import { ellipsis, wrap } from './text-wrap';

export const FACE_W = 256;
export const FACE_H = Math.round(FACE_W * (CARD_H / CARD_W));
export const BOARD_FACE_W = 256;
export const BOARD_FACE_H = Math.round(BOARD_FACE_W * (BOARD_CARD_H / BOARD_CARD_W));

export const PRINTED_FACE_W = 400;
export const PRINTED_FACE_H = Math.round(PRINTED_FACE_W * (CARD_H / CARD_W));

const CREDIT_SHARE = BOARD_CREDIT_H / BOARD_CARD_H;

const scrim = (alpha: number): string => `rgba(8, 6, 4, ${alpha})`;

const PIP_SIZE = 17;
const PIP_STEP = 20;

const LAND_PIP_SIZE = 38;
const LAND_PIP_GAP = 4;
const LAND_PIP_ORDER: readonly ManaLetter[] = ['W', 'U', 'B', 'R', 'G', 'C'];

const RULES_PIP = 11;

const EMBLEM_SIZE = 41;
const EMBLEM_GAP = 5;
const EMBLEM_PER_ROW = 3;

const FONT = 'ui-sans-serif, system-ui, sans-serif';

export type FaceStyle = 'board' | 'full' | 'printed';

export function faceSize(style: FaceStyle): { w: number; h: number } {
  if (style === 'printed') return { w: PRINTED_FACE_W, h: PRINTED_FACE_H };
  return style === 'full' ? { w: FACE_W, h: FACE_H } : { w: BOARD_FACE_W, h: BOARD_FACE_H };
}

export interface FaceInput {
  card: CardView;
  permanent: PermanentStateView | null;

  artUrl: string | null;

  artist?: string | null;

  faded?: boolean;
  style: FaceStyle;
}

export function faceSignature({
  card,
  permanent,
  artUrl,
  faded,
  style,
  artist,
}: FaceInput): string {
  const board = style === 'board';
  return [
    card.faceDown ? 'back' : card.name,
    style,
    faded ? 'phased' : '',
    board && permanent?.tapped ? 'tapped' : '',
    card.displayName ?? '',
    card.manaCost ?? '',
    card.typeLine ?? '',
    card.power ?? '',
    card.toughness ?? '',
    card.loyalty ?? '',
    card.frameColor ?? card.colors.join(''),
    card.isToken ? 'token' : '',
    isCommander(card) ? 'cmd' : '',
    card.counters.map((counter) => `${counter.name}${counter.count}`).join(','),
    permanent?.damage ? `dmg${permanent.damage}` : '',
    permanent?.isCopy ? 'copy' : '',

    board ? '' : card.rules.join(' ').slice(0, 120),
    board ? (artist ?? '') : '',
    board ? emblemsFor(card).join(',') : '',
    artUrl ?? '',
  ].join('|');
}

function typeIsSelfEvident(card: CardView): boolean {
  return isCreature(card) || isLand(card);
}

export function paintFace(
  ctx: CanvasRenderingContext2D,
  input: FaceInput,
  art: CanvasImageSource | null,
): void {
  const { card, permanent } = input;
  const { w, h } = faceSize(input.style);
  const radius = h * (14 / FACE_H);

  const creditShare = isLand(card) ? CREDIT_SHARE / LAND_SCALE : CREDIT_SHARE;
  const creditH = input.style === 'board' ? h * creditShare : 0;
  const artH = h - creditH;

  ctx.clearRect(0, 0, w, h);

  if (input.style === 'printed' && art && !card.faceDown) {
    drawCover(ctx, art, 0, 0, w, h);
    if (input.faded) paintGhost(ctx, w, h);
    paintBorder(ctx, w, h, radius, card, permanent);
    return;
  }

  const tapped = input.style === 'board' && !!permanent?.tapped;

  if (card.faceDown) {
    paintBack(ctx, w, h);
    if (creditH) paintCredit(ctx, w, h, creditH, null);
    paintBorder(ctx, w, h, radius, card, permanent);
    if (tapped) paintTappedOverlay(ctx, w, artH);
    return;
  }

  paintFrame(ctx, w, h, card);

  const full = input.style !== 'board';
  if (art) {
    if (tapped) ctx.filter = 'grayscale(0.85) brightness(0.82)';
    drawCover(ctx, art, 0, 0, w, artH);
    ctx.filter = 'none';
    paintScrims(ctx, w, h, artH, full);
  }

  if (tapped) paintTappedOverlay(ctx, w, artH);

  if (!full && !tapped) paintLandManaPips(ctx, w, artH, card);

  const pips = parseManaCost(card.manaCost);
  const pipWidth = pips.length * PIP_STEP;

  ctx.fillStyle = CARD_INK.text;
  ctx.textBaseline = 'top';
  ctx.font = `600 21px ${FONT}`;
  const nameLines = wrap(ctx, cardDisplayName(card), w - 24 - pipWidth, 2);
  nameLines.forEach((line, index) => ctx.fillText(line, 12, 11 + index * 23));

  pips.forEach((symbol, index) => {
    paintManaSymbol(ctx, symbol, w - 12 - (pips.length - index) * PIP_STEP + 2, 12, PIP_SIZE);
  });

  const typeTop = 13 + nameLines.length * 23;
  const typeLine = full || !typeIsSelfEvident(card) ? (card.typeLine ?? '') : '';
  if (typeLine) {
    ctx.font = `500 14px ${FONT}`;
    ctx.fillStyle = CARD_INK.muted;
    ctx.fillText(ellipsis(ctx, typeLine, w - 24), 12, typeTop);
  }

  const rules = full
    ? card.rules
        .map((rule) => stripTags(rule, card.name))
        .filter(Boolean)
        .join(' • ')
    : '';
  if (rules) {
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = CARD_INK.rules;
    paintRules(ctx, rules, 12, Math.max(typeTop + 26, h * 0.52), w - 24, 5);
  }

  paintFooter(ctx, w, artH, input);
  if (creditH) paintCredit(ctx, w, h, creditH, input.artist ?? null);
  if (input.faded) paintGhost(ctx, w, h);
  paintBorder(ctx, w, h, radius, card, permanent);
}

function paintTappedOverlay(ctx: CanvasRenderingContext2D, w: number, artH: number): void {
  ctx.fillStyle = 'rgba(10, 9, 8, 0.4)';
  ctx.fillRect(0, 0, w, artH);

  ctx.globalAlpha = 0.7;
  paintTapGlyph(ctx, w / 2, artH / 2, w * 0.55, CARD_INK.text);
  ctx.globalAlpha = 1;
}

function paintFrame(ctx: CanvasRenderingContext2D, w: number, h: number, card: CardView): void {
  ctx.fillStyle = CARD_INK.base;
  ctx.fillRect(0, 0, w, h);
  const colors = frameColorsOf(card);
  if (!colors.length) return;
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  colors.forEach((color, index) =>
    gradient.addColorStop(index / Math.max(1, colors.length - 1), color),
  );
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = colors.length === 1 ? colors[0] : gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

function paintScrims(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  artH: number,
  full: boolean,
): void {
  const topH = full ? h * 0.34 : h * 0.22;
  const top = ctx.createLinearGradient(0, 0, 0, topH);
  top.addColorStop(0, scrim(full ? 0.78 : 0.68));
  top.addColorStop(1, scrim(0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, topH);

  const bottomStart = full ? h * 0.5 : artH * 0.62;
  const bottom = ctx.createLinearGradient(0, bottomStart, 0, artH);
  bottom.addColorStop(0, scrim(0));
  bottom.addColorStop(0.45, scrim(full ? 0.72 : 0.5));
  bottom.addColorStop(1, scrim(full ? 0.85 : 0.72));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, bottomStart, w, artH - bottomStart);
}

function paintGhost(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(20, 18, 15, 0.62)';
  ctx.fillRect(0, 0, w, h);
}

function paintCredit(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  creditH: number,
  artist: string | null,
): void {
  const top = h - creditH;
  const fadeH = creditH * 1.7;
  const fade = ctx.createLinearGradient(0, top - fadeH, 0, top);
  fade.addColorStop(0, scrim(0));
  fade.addColorStop(1, scrim(1));
  ctx.fillStyle = fade;
  ctx.fillRect(0, top - fadeH, w, fadeH);
  ctx.fillStyle = scrim(1);
  ctx.fillRect(0, top, w, h - top);

  if (!artist) return;

  const inset = 12;
  const size = creditH * 0.52;
  const gap = 5;
  const middle = top + creditH / 2;

  ctx.font = `500 ${Math.round(creditH * 0.55)}px ${FONT}`;
  const name = ellipsis(ctx, artist, w - inset * 2 - size - gap);
  const nameLeft = w - inset - ctx.measureText(name).width;

  paintArtistNib(ctx, nameLeft - gap - size, middle - size / 2, size, CARD_INK.muted);
  ctx.fillStyle = CARD_INK.muted;
  ctx.textBaseline = 'middle';
  ctx.fillText(name, nameLeft, middle + 0.5);
  ctx.textBaseline = 'top';
}

function landManaLetters(card: CardView): ManaLetter[] {
  if (!isLand(card)) return [];
  const letters = new Set<ManaLetter>();
  for (const rule of card.rules) {
    for (const letter of producedMana(stripTags(rule)) ?? []) letters.add(letter);
  }
  return LAND_PIP_ORDER.filter((letter) => letters.has(letter));
}

function paintLandManaPips(
  ctx: CanvasRenderingContext2D,
  w: number,
  contentH: number,
  card: CardView,
): void {
  const letters = landManaLetters(card);
  if (!letters.length) return;
  const rowW = letters.length * LAND_PIP_SIZE + (letters.length - 1) * LAND_PIP_GAP;
  let x = (w - rowW) / 2;
  const y = (contentH - LAND_PIP_SIZE) / 2;
  for (const letter of letters) {
    const symbol = manaSymbol(letter);
    if (symbol) paintManaSymbol(ctx, symbol, x, y, LAND_PIP_SIZE);
    x += LAND_PIP_SIZE + LAND_PIP_GAP;
  }
}

function paintFooter(
  ctx: CanvasRenderingContext2D,
  w: number,
  contentH: number,
  { card, permanent, style }: FaceInput,
): void {
  const bottom = contentH - 12;

  const showingPT = isCreature(card) && !!(card.power || card.toughness);
  const stats = showingPT
    ? `${card.power ?? '?'}/${card.toughness ?? '?'}`
    : card.loyalty
      ? `${card.loyalty}`
      : '';
  if (stats) {
    ctx.font = `700 41px ${FONT}`;
    const width = ctx.measureText(stats).width + 28;
    const height = 50;
    const x = w - 12 - width;
    const y = bottom - height;
    ctx.fillStyle = 'rgba(6, 5, 4, 0.78)';
    roundedRectPath(ctx, x, y, width, height, 11);
    ctx.fill();
    ctx.fillStyle = !showingPT && card.loyalty ? '#e7d9a8' : CARD_INK.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(stats, x + width / 2, y + height / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  const emblems = style === 'board' ? emblemsFor(card) : [];
  const emblemRows = Math.ceil(emblems.length / EMBLEM_PER_ROW);
  emblems.forEach((emblem, index) => {
    const column = index % EMBLEM_PER_ROW;
    const row = Math.floor(index / EMBLEM_PER_ROW);
    paintEmblem(
      ctx,
      emblem,
      12 + column * (EMBLEM_SIZE + EMBLEM_GAP),
      bottom - EMBLEM_SIZE - row * (EMBLEM_SIZE + EMBLEM_GAP),
      EMBLEM_SIZE,
    );
  });

  const chipBottom = bottom - emblemRows * (EMBLEM_SIZE + EMBLEM_GAP);
  let x = 12;
  const chip = (text: string, background: string, color: string) => {
    ctx.font = `600 22px ${FONT}`;
    const width = ctx.measureText(text).width + 19;
    ctx.fillStyle = background;
    roundedRectPath(ctx, x, chipBottom - 32, width, 32, 8);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x + 10, chipBottom - 26);
    x += width + 6;
  };

  const chipIcon = (glyph: string, count: number, background: string, color: string) => {
    const glyphSize = 26;
    const countText = count > 1 ? String(count) : '';
    ctx.font = `700 20px ${FONT}`;
    const countW = countText ? ctx.measureText(countText).width + 4 : 0;
    const width = glyphSize + 14 + countW;
    ctx.fillStyle = background;
    roundedRectPath(ctx, x, chipBottom - 32, width, 32, 8);
    ctx.fill();
    paintManaGlyph(ctx, glyph, x + 7 + glyphSize / 2, chipBottom - 16, glyphSize, color);
    if (countText) {
      ctx.fillStyle = color;
      ctx.fillText(countText, x + 11 + glyphSize, chipBottom - 26);
    }
    x += width + 6;
  };

  if (permanent?.damage) chip(`−${permanent.damage}`, 'rgba(212, 104, 90, 0.9)', '#1b0f0d');
  for (const counter of card.counters.slice(0, 2)) {
    const glyph = counterGlyphFor(counter.name);
    if (glyph) chipIcon(glyph, counter.count, 'rgba(6, 5, 4, 0.75)', CARD_INK.text);
    else
      chip(
        counterLabel(counter.count, shortCounter(counter.name)),
        'rgba(6, 5, 4, 0.75)',
        CARD_INK.text,
      );
  }
  if (card.isToken) chip('token', 'rgba(6, 5, 4, 0.75)', CARD_INK.muted);
}

function paintBorder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  radius: number,
  card: CardView,
  permanent: PermanentStateView | null,
): void {
  const commander = isCommander(card);
  const dashed = card.faceDown || permanent?.isCopy;
  if (commander || dashed) {
    ctx.save();
    roundedRectPath(ctx, 2, 2, w - 4, h - 4, radius - 1);
    ctx.lineWidth = commander ? 6 : 3;
    ctx.strokeStyle = commander ? '#d9b45c' : 'rgba(0, 0, 0, 0.65)';
    if (dashed) ctx.setLineDash([10, 7]);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const size = imageSize(image);
  if (!size) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.max(w / size.width, h / size.height);
  const drawW = size.width * scale;
  const drawH = size.height * scale;
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

function imageSize(image: CanvasImageSource): { width: number; height: number } | null {
  const source = image as {
    naturalWidth?: number;
    width?: number;
    naturalHeight?: number;
    height?: number;
  };
  const width = source.naturalWidth ?? (typeof source.width === 'number' ? source.width : 0);
  const height = source.naturalHeight ?? (typeof source.height === 'number' ? source.height : 0);
  return width && height ? { width, height } : null;
}

function paintRules(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
): void {
  type Atom = { word?: string; symbol?: ManaSymbol; space: boolean; width: number };

  const spaceWidth = ctx.measureText(' ').width;
  const atoms: Atom[] = [];
  let pendingSpace = false;
  for (const run of splitManaText(text)) {
    if (run.symbol) {
      atoms.push({ symbol: run.symbol, space: pendingSpace, width: RULES_PIP });
      pendingSpace = false;
      continue;
    }
    run.text.split(/\s+/).forEach((word, index) => {
      if (!word) {
        pendingSpace = true;
        return;
      }
      atoms.push({ word, space: pendingSpace || index > 0, width: ctx.measureText(word).width });
      pendingSpace = false;
    });
    pendingSpace = pendingSpace || /\s$/.test(run.text);
  }

  const lines: Atom[][] = [[]];
  let width = 0;
  let truncated = false;
  for (const atom of atoms) {
    const line = lines[lines.length - 1];
    const lead = atom.space && line.length ? spaceWidth : 0;
    if (line.length && width + lead + atom.width > maxWidth) {
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
      lines.push([{ ...atom, space: false }]);
      width = atom.width;
      continue;
    }
    line.push(line.length ? atom : { ...atom, space: false });
    width += lead + atom.width;
  }

  lines.forEach((line, index) => {
    let cursor = x;
    for (const atom of line) {
      if (atom.space) cursor += spaceWidth;
      if (atom.symbol) paintManaSymbol(ctx, atom.symbol, cursor, y + index * 16 + 1.5, atom.width);
      else ctx.fillText(atom.word!, cursor, y + index * 16);
      cursor += atom.width;
    }
    if (truncated && index === lines.length - 1) ctx.fillText('…', cursor, y + index * 16);
  });
}

function shortCounter(name: string): string {
  return name.length <= 6 ? name : `${name.slice(0, 5)}…`;
}
