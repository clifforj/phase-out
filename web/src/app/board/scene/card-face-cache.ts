import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  SRGBColorSpace,
} from 'three';
import { makeCanvas } from './canvas';
import { ImageCache } from './image-cache';
import { type FaceInput, faceSignature, faceSize, paintFace } from './paint-face';
import { paintBack } from './paint-back';
import { onManaFontLoaded } from './paint-mana-font';
import { onManaSymbolImageLoaded } from './paint-mana-symbol';

const TEXTURE_BUDGET = 240;

interface CachedFace {
  material: MeshBasicMaterial;
  texture: CanvasTexture;
  canvas: HTMLCanvasElement;
  usedAt: number;
  input: FaceInput;
}

function withPaintableStyle(input: FaceInput): FaceInput {
  if (input.style !== 'printed' || input.artUrl) return input;
  return { ...input, style: 'full' };
}

export class CardFaceCache {
  private readonly faces = new Map<string, CachedFace>();
  private readonly images = new ImageCache((url, image) => this.repaint(url, image));
  private clock = 0;
  private readonly unsubscribeManaSymbols: () => void;
  private readonly unsubscribeManaFont: () => void;

  constructor(private readonly onRepaint: () => void) {
    this.unsubscribeManaSymbols = onManaSymbolImageLoaded(() => this.repaintAll());
    this.unsubscribeManaFont = onManaFontLoaded(() => this.repaintAll());
  }

  material(request: FaceInput): MeshBasicMaterial {
    const input = withPaintableStyle(request);
    const key = faceSignature(input);
    const existing = this.faces.get(key);
    if (existing) {
      existing.usedAt = ++this.clock;
      return existing.material;
    }

    const { w, h } = faceSize(input.style);
    const { canvas, ctx } = makeCanvas(w, h);
    const art = input.artUrl ? this.images.get(input.artUrl) : null;
    if (ctx) {
      if (input.card.faceDown) paintBack(ctx, w, h);
      else paintFace(ctx, input, art);
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    const material = new MeshBasicMaterial({ map: texture, side: DoubleSide });
    this.faces.set(key, { material, texture, canvas, usedAt: ++this.clock, input });
    this.evict();
    return material;
  }

  private repaint(url: string, image: HTMLImageElement): void {
    this.repaintWhere(
      (face) => face.input.artUrl === url,
      () => image,
    );
  }

  private repaintAll(): void {
    this.repaintWhere(
      (face) => !face.input.card.faceDown,
      (face) => (face.input.artUrl ? this.images.get(face.input.artUrl) : null),
    );
  }

  private repaintWhere(
    matches: (face: CachedFace) => boolean,
    artFor: (face: CachedFace) => HTMLImageElement | null,
  ): void {
    let repainted = false;
    for (const face of this.faces.values()) {
      if (!matches(face)) continue;
      const ctx = face.canvas.getContext('2d');
      if (!ctx) continue;
      paintFace(ctx, face.input, artFor(face));
      face.texture.needsUpdate = true;
      repainted = true;
    }
    if (repainted) this.onRepaint();
  }

  private evict(): void {
    if (this.faces.size <= TEXTURE_BUDGET) return;
    const oldest = [...this.faces.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (const [key, face] of oldest.slice(0, this.faces.size - TEXTURE_BUDGET)) {
      face.material.dispose();
      face.texture.dispose();
      this.faces.delete(key);
    }
  }

  dispose(): void {
    for (const face of this.faces.values()) {
      face.material.dispose();
      face.texture.dispose();
    }
    this.faces.clear();
    this.images.clear();
    this.unsubscribeManaSymbols();
    this.unsubscribeManaFont();
  }
}
