import { TestBed } from '@angular/core/testing';
import { CardArtService } from './card-art';
import type { CardView } from './protocol';

function card(overrides: Partial<CardView> = {}): CardView {
  return {
    objectId: 'card-1',
    name: "Commander's Sphere",
    colors: [],
    rules: [],
    counters: [],
    icons: [],
    setCode: 'C14',
    cardNumber: '54',
    ...overrides,
  } as CardView;
}

function token(overrides: Partial<CardView> = {}): CardView {
  return card({
    name: 'Soldier Token',
    setCode: 'DOM',
    cardNumber: undefined,
    isToken: true,
    ...overrides,
  });
}

const PAYLOAD_NAME = 'card-images.abcdef012345.json';
const TOKEN_PAYLOAD_NAME = 'token-images.abcdef012345.json';

function serveIndex(
  index: Record<string, { n: string; c: string; a?: string }> | null,
  tokenIndex?: Record<string, { n: string; c: string; a?: string }> | null,
) {
  vi.stubGlobal('fetch', (url: string) => {
    if (url === '/card-images.json') {
      return Promise.resolve({
        ok: index !== null,
        json: () => Promise.resolve(index === null ? null : { file: PAYLOAD_NAME }),
      } as Response);
    }
    if (url === `/${PAYLOAD_NAME}`) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(index) } as Response);
    }
    if (url === '/token-images.json') {
      return Promise.resolve({
        ok: tokenIndex != null,
        json: () => Promise.resolve(tokenIndex == null ? null : { file: TOKEN_PAYLOAD_NAME }),
      } as Response);
    }
    if (url === `/${TOKEN_PAYLOAD_NAME}`) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(tokenIndex) } as Response);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function captureSources(): string[] {
  const tried: string[] = [];
  class FailingImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      tried.push(url);

      setTimeout(() => this.onerror?.());
    }
  }
  vi.stubGlobal('Image', FailingImage);
  return tried;
}

describe('card art sources', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the index entry directly — it is already a cards.scryfall.io URL', async () => {
    serveIndex({
      'c14/54': {
        n: 'https://cards.scryfall.io/normal/c14-54.jpg',
        c: 'https://cards.scryfall.io/art_crop/c14-54.jpg',
      },
    });
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(card());
    await vi.waitFor(() => expect(tried.length).toBeGreaterThan(0));

    expect(tried[0]).toBe('https://cards.scryfall.io/normal/c14-54.jpg');
    expect(service.enabled).toBe(true);
  });

  it('asks for the crop variant when the table wants one', async () => {
    serveIndex({
      'c14/54': {
        n: 'https://cards.scryfall.io/normal/c14-54.jpg',
        c: 'https://cards.scryfall.io/art_crop/c14-54.jpg',
      },
    });
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(card(), 'crop');
    await vi.waitFor(() => expect(tried.length).toBeGreaterThan(0));

    expect(tried[0]).toBe('https://cards.scryfall.io/art_crop/c14-54.jpg');
  });

  it('falls back to a live Scryfall lookup for a printing the index does not name', async () => {
    serveIndex({});
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(card());
    await vi.waitFor(() => expect(tried).toHaveLength(1));

    expect(tried[0]).toContain('api.scryfall.com/cards/c14/54');
    expect(tried[0]).toContain('version=normal');
  });

  it('falls back live when the pointer 404s (a fresh clone with no lookup built)', async () => {
    serveIndex(null);
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(card());
    await vi.waitFor(() => expect(tried).toHaveLength(1));
    expect(tried[0]).toContain('api.scryfall.com');
  });

  it('falls back live when the pointer names a payload that does not answer', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (url === '/card-images.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ file: PAYLOAD_NAME }),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(card());
    await vi.waitFor(() => expect(tried).toHaveLength(1));
    expect(tried[0]).toContain('api.scryfall.com');
  });

  it('falls back live rather than trust a pointer naming something outside its own shape', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (url === '/card-images.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ file: '../whatever' }),
        } as Response);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(card());
    await vi.waitFor(() => expect(tried).toHaveLength(1));
    expect(tried[0]).toContain('api.scryfall.com');
  });

  it('asks for nothing at all when art is off', async () => {
    serveIndex({});
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);
    service.setMode('none');

    expect(service.artFor(card())()).toBeNull();
    expect(tried).toEqual([]);
  });

  it('looks a printing up once, however many copies of the card are on the board', async () => {
    serveIndex({});
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(card({ objectId: 'a' }));
    service.artFor(card({ objectId: 'b' }));
    await vi.waitFor(() => expect(tried).toHaveLength(1));
    expect(new Set(tried).size).toBe(1);
  });
});

describe('token art', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('strips the " Token" suffix XMage names it with and keys by set/name, lowercased', async () => {
    serveIndex(
      {},
      { 'dom/soldier': { n: 'https://cards.scryfall.io/normal/dom-soldier.jpg', c: 'c.jpg' } },
    );
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(token());
    await vi.waitFor(() => expect(tried.length).toBeGreaterThan(0));

    expect(tried).toEqual(['https://cards.scryfall.io/normal/dom-soldier.jpg']);
  });

  it('appends the image number when a set has more than one token of the same name', async () => {
    serveIndex(
      {},
      {
        'dom/knight/1': { n: 'knight1-n.jpg', c: 'knight1-c.jpg' },
        'dom/knight/2': { n: 'knight2-n.jpg', c: 'knight2-c.jpg' },
      },
    );
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(token({ name: 'Knight Token', imageNumber: 2 }), 'crop');
    await vi.waitFor(() => expect(tried.length).toBeGreaterThan(0));

    expect(tried).toEqual(['knight2-c.jpg']);
  });

  it('renders a text tile, with no live fallback, for a token the index does not name', async () => {
    serveIndex({}, {});
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(token());

    await Promise.resolve().then().then();
    expect(tried).toEqual([]);
  });

  it('resolves a token that came from a card (Embalm, a copy effect, ...) the ordinary printing way', async () => {
    serveIndex({ 'c14/54': { n: 'card-n.jpg', c: 'card-c.jpg' } });
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);

    service.artFor(token({ setCode: 'C14', cardNumber: '54' }));
    await vi.waitFor(() => expect(tried.length).toBeGreaterThan(0));

    expect(tried[0]).toBe('card-n.jpg');
  });

  it('asks for nothing at all when art is off', async () => {
    serveIndex({}, { 'dom/soldier': { n: 'n.jpg', c: 'c.jpg' } });
    const tried = captureSources();
    const service = TestBed.inject(CardArtService);
    service.setMode('none');

    expect(service.artFor(token())()).toBeNull();
    expect(tried).toEqual([]);
  });
});

describe('token artist credits', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names the artist of a token, from the token index', async () => {
    serveIndex({}, { 'dom/soldier': { n: 'n.jpg', c: 'c.jpg', a: 'Livia Prima' } });
    const service = TestBed.inject(CardArtService);

    const artist = service.artistFor(token());
    await vi.waitFor(() => expect(artist()).toBe('Livia Prima'));
  });

  it('has no name when the token index has not been built', async () => {
    serveIndex({}, null);
    const service = TestBed.inject(CardArtService);

    const artist = service.artistFor(token());
    await Promise.resolve().then();
    expect(artist()).toBeNull();
  });

  it('still reads the token index for a credit when art is off', async () => {
    serveIndex({}, { 'dom/soldier': { n: 'n.jpg', c: 'c.jpg', a: 'Livia Prima' } });
    const service = TestBed.inject(CardArtService);
    service.setMode('none');

    const artist = service.artistFor(token());
    await vi.waitFor(() => expect(artist()).toBe('Livia Prima'));
  });
});

describe('artist credits', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names the artist of a printing, from the index', async () => {
    serveIndex({ 'c14/54': { n: 'n.jpg', c: 'c.jpg', a: 'Daniel Ljunggren' } });
    const service = TestBed.inject(CardArtService);

    const artist = service.artistFor(card());
    await vi.waitFor(() => expect(artist()).toBe('Daniel Ljunggren'));
  });

  it('reads the index once (pointer, then payload), whatever the board asks it', async () => {
    let fetches = 0;
    vi.stubGlobal('fetch', (url: string) => {
      fetches++;
      if (url === '/card-images.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ file: PAYLOAD_NAME }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            'c14/54': { n: 'n.jpg', c: 'c.jpg', a: 'Daniel Ljunggren' },
            'c14/55': { n: 'n.jpg', c: 'c.jpg', a: 'Chase Stone' },
          }),
      } as Response);
    });
    const service = TestBed.inject(CardArtService);

    const first = service.artistFor(card({ objectId: 'a' }));
    service.artistFor(card({ objectId: 'b', setCode: 'C14', cardNumber: '55' }));
    await vi.waitFor(() => expect(first()).toBe('Daniel Ljunggren'));

    expect(fetches).toBe(2);
  });

  it('has no name when the index does not know the printing', async () => {
    serveIndex({ 'c14/54': { n: 'n.jpg', c: 'c.jpg' } });
    const service = TestBed.inject(CardArtService);

    const artist = service.artistFor(card());

    await Promise.resolve().then();
    expect(artist()).toBeNull();
  });

  it('has no name at all when the index has not been built', async () => {
    serveIndex(null);
    const service = TestBed.inject(CardArtService);

    const artist = service.artistFor(card());
    await Promise.resolve().then();
    expect(artist()).toBeNull();
  });

  it('still reads the index for a credit when art is off', async () => {
    serveIndex({ 'c14/54': { n: 'n.jpg', c: 'c.jpg', a: 'Daniel Ljunggren' } });
    const service = TestBed.inject(CardArtService);
    service.setMode('none');

    const artist = service.artistFor(card());
    await vi.waitFor(() => expect(artist()).toBe('Daniel Ljunggren'));
  });

  it('has no name for a card with no printing to look up', () => {
    serveIndex({ 'c14/54': { n: 'n.jpg', c: 'c.jpg', a: 'Daniel Ljunggren' } });
    const service = TestBed.inject(CardArtService);

    expect(service.artistFor(card({ setCode: undefined }))()).toBeNull();
  });
});
