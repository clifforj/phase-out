import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import type { CardView } from './protocol';

const IMAGE_INDEX_POINTER = '/card-images.json';
const TOKEN_IMAGE_INDEX_POINTER = '/token-images.json';

const PAYLOAD_NAME = /^card-images\.[0-9a-f]{12}\.json$/;

const TOKEN_PAYLOAD_NAME = /^token-images\.[0-9a-f]{12}\.json$/;
const SCRYFALL_CARD = 'https://api.scryfall.com/cards';
const REQUESTS_PER_SECOND = 10;

export type CardArtMode = 'none' | 'scryfall';

export type CardArtVariant = 'full' | 'crop';

interface IndexEntry {
  n: string;

  c: string;

  a?: string;
}

@Injectable({ providedIn: 'root' })
export class CardArtService {
  private readonly mode = signal<CardArtMode>(environment.cardArt);

  private index: Record<string, IndexEntry> = {};
  private indexLoad: Promise<void> | null = null;

  private tokenIndex: Record<string, IndexEntry> = {};
  private tokenIndexLoad: Promise<void> | null = null;

  private readonly urls = new Map<string, ReturnType<typeof signal<string | null>>>();
  private readonly artists = new Map<string, ReturnType<typeof signal<string | null>>>();
  private readonly tokenUrls = new Map<string, ReturnType<typeof signal<string | null>>>();
  private readonly tokenArtists = new Map<string, ReturnType<typeof signal<string | null>>>();

  private nextFallbackStart = 0;

  get enabled(): boolean {
    return this.mode() !== 'none';
  }

  setMode(mode: CardArtMode): void {
    this.mode.set(mode);
  }

  artFor(card: CardView, variant: CardArtVariant = 'full') {
    if (card.isToken && !card.cardNumber) return this.artForToken(card, variant);
    return this.artForPrinting(card.setCode, card.cardNumber, variant);
  }

  private artForToken(card: CardView, variant: CardArtVariant) {
    const tokenKey = tokenKeyOf(card);
    if (!this.enabled || !tokenKey) return signal<string | null>(null).asReadonly();
    const key = `${tokenKey}:${variant}`;

    let url = this.tokenUrls.get(key);
    if (!url) {
      url = signal<string | null>(null);
      this.tokenUrls.set(key, url);
      void this.resolveToken(tokenKey, variant, url);
    }
    return url.asReadonly();
  }

  artForPrinting(setCode?: string, cardNumber?: string, variant: CardArtVariant = 'full') {
    const printing = printingOf(setCode, cardNumber);
    if (!this.enabled || !printing) return signal<string | null>(null).asReadonly();
    const key = `${printing}:${variant}`;

    let url = this.urls.get(key);
    if (!url) {
      url = signal<string | null>(null);
      this.urls.set(key, url);
      void this.resolve(printing, variant, url);
    }
    return url.asReadonly();
  }

  artistFor(card: CardView) {
    if (card.isToken && !card.cardNumber) return this.artistForToken(card);
    return this.artistForPrinting(card.setCode, card.cardNumber);
  }

  private artistForToken(card: CardView) {
    const tokenKey = tokenKeyOf(card);
    if (!tokenKey) return signal<string | null>(null).asReadonly();

    let artist = this.tokenArtists.get(tokenKey);
    if (!artist) {
      artist = signal<string | null>(null);
      this.tokenArtists.set(tokenKey, artist);
      void this.resolveTokenArtist(tokenKey, artist);
    }
    return artist.asReadonly();
  }

  artistForPrinting(setCode?: string, cardNumber?: string) {
    const printing = printingOf(setCode, cardNumber);
    if (!printing) return signal<string | null>(null).asReadonly();

    let artist = this.artists.get(printing);
    if (!artist) {
      artist = signal<string | null>(null);
      this.artists.set(printing, artist);
      void this.resolveArtist(printing, artist);
    }
    return artist.asReadonly();
  }

  private async resolveArtist(
    printing: string,
    artist: ReturnType<typeof signal<string | null>>,
  ): Promise<void> {
    await this.loadIndex();
    const name = this.index[printing]?.a;
    if (name) artist.set(name);
  }

  private async resolveTokenArtist(
    tokenKey: string,
    artist: ReturnType<typeof signal<string | null>>,
  ): Promise<void> {
    await this.loadTokenIndex();
    const name = this.tokenIndex[tokenKey]?.a;
    if (name) artist.set(name);
  }

  private loadIndex(): Promise<void> {
    this.indexLoad ??= fetchIndex(IMAGE_INDEX_POINTER, PAYLOAD_NAME).then((parsed) => {
      this.index = parsed;
    });
    return this.indexLoad;
  }

  private loadTokenIndex(): Promise<void> {
    this.tokenIndexLoad ??= fetchIndex(TOKEN_IMAGE_INDEX_POINTER, TOKEN_PAYLOAD_NAME).then(
      (parsed) => {
        this.tokenIndex = parsed;
      },
    );
    return this.tokenIndexLoad;
  }

  private async resolveToken(
    tokenKey: string,
    variant: CardArtVariant,
    url: ReturnType<typeof signal<string | null>>,
  ): Promise<void> {
    await this.loadTokenIndex();
    const entry = this.tokenIndex[tokenKey];
    if (!entry) return;
    const candidate = variant === 'crop' ? entry.c : entry.n;
    if (await loads(candidate)) url.set(candidate);
  }

  private async resolve(
    printing: string,
    variant: CardArtVariant,
    url: ReturnType<typeof signal<string | null>>,
  ): Promise<void> {
    await this.loadIndex();
    for (const candidate of this.sourcesFor(printing, variant)) {
      if (candidate.throttled) await this.spaceOutFallbackRequests();
      if (await loads(candidate.url)) {
        url.set(candidate.url);
        return;
      }
    }
  }

  private sourcesFor(
    printing: string,
    variant: CardArtVariant,
  ): { url: string; throttled: boolean }[] {
    const entry = this.index[printing];
    const sources: { url: string; throttled: boolean }[] = [];
    if (entry) sources.push({ url: variant === 'crop' ? entry.c : entry.n, throttled: false });

    const [setCode, cardNumber] = printing.split('/');
    const remoteVersion = variant === 'crop' ? 'art_crop' : 'normal';
    sources.push({
      url: `${SCRYFALL_CARD}/${encodeURIComponent(setCode)}/${encodeURIComponent(cardNumber)}?format=image&version=${remoteVersion}`,
      throttled: true,
    });
    return sources;
  }

  private async spaceOutFallbackRequests(): Promise<void> {
    const gap = 1000 / REQUESTS_PER_SECOND;
    const now = Date.now();
    const start = Math.max(now, this.nextFallbackStart);
    this.nextFallbackStart = start + gap;
    if (start > now) await new Promise((done) => setTimeout(done, start - now));
  }
}

function printingOf(setCode?: string, cardNumber?: string): string | null {
  if (!setCode || !cardNumber) return null;

  return `${setCode.toLowerCase()}/${cardNumber.toLowerCase()}`;
}

const TOKEN_NAME_SUFFIX = / Token$/;

function tokenKeyOf(card: CardView): string | null {
  if (!card.setCode || !card.name) return null;
  const name = card.name.replace(TOKEN_NAME_SUFFIX, '').toLowerCase();
  const suffix = card.imageNumber ? `/${card.imageNumber}` : '';
  return `${card.setCode.toLowerCase()}/${name}${suffix}`;
}

async function fetchIndex(
  pointerUrl: string,
  payloadNamePattern: RegExp,
): Promise<Record<string, IndexEntry>> {
  try {
    const pointer = await fetch(pointerUrl);
    if (!pointer.ok) throw new Error(`HTTP ${pointer.status}`);
    const { file } = (await pointer.json()) as { file?: unknown };
    if (typeof file !== 'string' || !payloadNamePattern.test(file))
      throw new Error('malformed pointer');

    const payload = await fetch(`/${file}`);
    if (!payload.ok) throw new Error(`HTTP ${payload.status}`);
    const parsed: unknown = await payload.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, IndexEntry>) : {};
  } catch {
    return {};
  }
}

function loads(url: string): Promise<boolean> {
  return new Promise((done) => {
    const image = new Image();
    image.onload = () => done(true);
    image.onerror = () => done(false);
    image.src = url;
  });
}
