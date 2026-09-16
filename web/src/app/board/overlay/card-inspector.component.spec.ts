import { TestBed } from '@angular/core/testing';
import type { CardView } from '../../core/protocol';
import type { Placement } from '../scene/layout';
import { CardInspectorComponent } from './card-inspector.component';

describe('CardInspectorComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  function serveCredits(artistByPrinting: Record<string, string>): void {
    const index = Object.fromEntries(
      Object.entries(artistByPrinting).map(([printing, artist]) => [
        printing,
        { n: '', c: '', a: artist },
      ]),
    );
    vi.stubGlobal('fetch', (url: string) => {
      if (url === '/card-images.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ file: 'card-images.abcdef012345.json' }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(index) } as Response);
    });
  }

  function placement(overrides: Partial<CardView> = {}): Placement {
    const card = {
      objectId: 'card-1',
      name: "Commander's Sphere",
      typeLine: 'Artifact',
      colors: [],
      rules: ['{T}: Add one mana of any color in your commander’s color identity.'],
      counters: [],
      icons: [],
      setCode: 'C14',
      cardNumber: '54',
      ...overrides,
    } as CardView;
    return {
      objectId: card.objectId,
      card,
      permanent: null,
      seat: 0,
      kind: 'permanent',
    } as Placement;
  }

  function open(card: Partial<CardView> = {}) {
    const fixture = TestBed.createComponent(CardInspectorComponent);
    fixture.componentRef.setInput('placement', placement(card));
    fixture.detectChanges();
    return {
      fixture,
      text: () => {
        fixture.detectChanges();
        return (fixture.nativeElement as HTMLElement).textContent ?? '';
      },
    };
  }

  it('credits the artist of the printing, once the manifest arrives', async () => {
    serveCredits({ 'c14/54': 'Daniel Ljunggren' });
    const { text } = open();

    await vi.waitFor(() => expect(text()).toContain('Daniel Ljunggren'));
  });

  it('says nothing about a face-down card, whose printing is the secret', async () => {
    serveCredits({ 'c14/54': 'Daniel Ljunggren' });
    const { text } = open({ faceDown: true });

    await new Promise((done) => setTimeout(done));
    expect(text()).not.toContain('Daniel Ljunggren');
    expect(text()).not.toContain('illustrated by');
  });

  it('leaves the row out entirely when nobody knows who painted it', async () => {
    serveCredits({});
    const { text } = open();

    await new Promise((done) => setTimeout(done));
    expect(text()).not.toContain('illustrated by');

    expect(text()).toContain("Commander's Sphere");
  });

  describe('a card on the stack', () => {
    function onStack(index: number, total: number) {
      const fixture = TestBed.createComponent(CardInspectorComponent);
      fixture.componentRef.setInput('placement', { ...placement(), kind: 'stack' });
      fixture.componentRef.setInput('stackDepth', { index, total });
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).textContent ?? '';
    }

    it('says it is next, and how much is waiting behind it', () => {
      expect(onStack(0, 1)).toContain('the stack');
      expect(onStack(0, 1)).toContain('next to resolve');

      expect(onStack(0, 1)).not.toContain('below it');
      expect(onStack(0, 3)).toContain('2 below it');
    });

    it('counts anything under the top from the top', () => {
      expect(onStack(2, 5)).toContain('3rd from the top of 5');
    });
  });
});
