import { onManaSymbolImageLoaded, paintManaSymbol } from './paint-mana-symbol';
import type { ManaSymbol } from '../../rules/mana-symbol';

describe('paintManaSymbol', () => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
    private _src = '';
    get src(): string {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      instances.push(this);
    }
  }

  let instances: FakeImage[];
  let originalImage: typeof Image;

  beforeEach(() => {
    instances = [];
    originalImage = globalThis.Image;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Image = FakeImage;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
  });

  function ctxStub() {
    return { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  }

  it('retries a symbol whose image load failed, rather than blanking it forever', () => {
    const symbol: ManaSymbol = { raw: 'retry-test', code: 'RETRY-TEST', label: 'test mana' };

    const ctx1 = ctxStub();
    paintManaSymbol(ctx1, symbol, 0, 0, 10);
    expect(instances).toHaveLength(1);
    expect(ctx1.drawImage).not.toHaveBeenCalled();

    instances[0].onerror?.();

    const ctx2 = ctxStub();
    paintManaSymbol(ctx2, symbol, 0, 0, 10);
    expect(instances).toHaveLength(2);
    expect(ctx2.drawImage).not.toHaveBeenCalled();

    const notified = vi.fn();
    const unsubscribe = onManaSymbolImageLoaded(notified);
    instances[1].onload?.();
    unsubscribe();
    expect(notified).toHaveBeenCalledTimes(1);

    const ctx3 = ctxStub();
    paintManaSymbol(ctx3, symbol, 0, 0, 10);
    expect(instances).toHaveLength(2);
    expect(ctx3.drawImage).toHaveBeenCalledWith(instances[1], 0, 0, 10, 10);
  });
});
