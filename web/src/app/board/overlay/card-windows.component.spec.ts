import { TestBed } from '@angular/core/testing';
import type { CardView } from '../../core/protocol';
import { type CardWindow, CardWindowsComponent } from './card-windows.component';

describe('CardWindowsComponent', () => {
  function card(objectId: string, name: string, extra: Partial<CardView> = {}): CardView {
    return {
      objectId,
      name,
      setCode: 'MH2',
      cardNumber: '198',
      rules: [],
      colors: [],
      icons: [],
      faceDown: false,
      isToken: false,
      counters: [],
      targets: [],
      ...extra,
    };
  }

  function open(variant: 'private' | 'public', windows: CardWindow[], selectable: string[] = []) {
    const fixture = TestBed.createComponent(CardWindowsComponent);
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('windows', windows);
    fixture.componentRef.setInput('selectableIds', new Set(selectable));
    const picked: string[] = [];
    fixture.componentInstance.pick.subscribe((id) => picked.push(id));
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, picked };
  }

  const topOfLibrary: CardWindow = {
    name: 'Top card of your library',
    cards: [card('top-1', 'Grim Tutor')],
  };
  const revealedTop: CardWindow = {
    name: 'Revealed',
    cards: [card('rev-1', 'Lightning Bolt', { typeLine: 'Instant' })],
  };

  describe('private', () => {
    it("labels a window with XMage's own name for it, and says whose knowledge it is", () => {
      const { element } = open('private', [topOfLibrary]);
      expect(element.textContent).toContain('Top card of your library');
      expect(element.textContent).toContain('Grim Tutor');
      expect(element.textContent).toContain('only you');
    });

    it('renders more than one window', () => {
      const { element } = open('private', [
        topOfLibrary,
        { name: 'Scry', cards: [card('scry-1', 'Ponder')] },
      ]);
      expect(
        [...element.querySelectorAll('h3 .label')].map((node) => node.textContent?.trim()),
      ).toEqual(['Top card of your library', 'Scry']);
    });

    it('marks a card the prompt will act on, and leaves the rest alone', () => {
      const { element } = open('private', [topOfLibrary], ['top-1']);
      expect(element.querySelector('.card')?.classList).toContain('selectable');

      const quiet = open('private', [topOfLibrary]);
      expect(quiet.element.querySelector('.card')?.classList).not.toContain('selectable');
    });

    it('reports the card clicked so the board can send the action it means', () => {
      const { element, picked } = open('private', [topOfLibrary], ['top-1']);
      element.querySelector<HTMLButtonElement>('.card')!.click();
      expect(picked).toEqual(['top-1']);
    });

    it('keeps an unactionable card reachable rather than disabling it', () => {
      const { element } = open('private', [topOfLibrary]);
      const button = element.querySelector<HTMLButtonElement>('.card')!;
      expect(button.disabled).toBe(false);
      expect(button.title).toContain('only you');
    });

    it('draws nothing at all when there are no windows', () => {
      const { element } = open('private', []);
      expect(element.querySelector('.window')).toBeNull();
    });
  });

  describe('public', () => {
    it("labels a window with XMage's own name for it, and says this is public knowledge", () => {
      const { element } = open('public', [revealedTop]);
      expect(element.textContent).toContain('Revealed');
      expect(element.textContent).toContain('Lightning Bolt');
      expect(element.textContent).toContain('revealed to everyone');
    });

    it('offers nothing to click: a reveal is informational', () => {
      const { element } = open('public', [revealedTop], ['rev-1']);
      expect(element.querySelector('button.card')).toBeNull();
      expect(element.querySelector('app-card-tile')).toBeTruthy();
    });

    it('renders more than one window', () => {
      const { element } = open('public', [
        revealedTop,
        { name: 'Duress', cards: [card('rev-2', 'Doom Blade')] },
      ]);
      expect(
        [...element.querySelectorAll('h3 .label')].map((node) => node.textContent?.trim()),
      ).toEqual(['Revealed', 'Duress']);
    });
  });
});
