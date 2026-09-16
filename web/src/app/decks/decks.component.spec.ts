import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DecksComponent } from './decks.component';
import { BRIDGE_SOCKET_FACTORY } from '../core/bridge-socket';
import { DeckStore } from '../core/deck-store';
import { GameStore } from '../core/game-store';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';
import type { DeckSummary } from '../core/protocol';

@Component({ selector: 'app-stub-deck-detail', template: '' })
class StubDeckDetailComponent {}

describe('DecksComponent', () => {
  function deck(overrides: Partial<DeckSummary> = {}): DeckSummary {
    return { deckId: 'limit-break-3f9a2c', name: 'Limit Break', cardCount: 100, ...overrides };
  }

  function render() {
    localStorage.clear();
    const socket = new FakeSocket();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'decks/:deckId', component: StubDeckDetailComponent }]),
        { provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) },
      ],
    });
    const store = TestBed.inject(GameStore);
    const decks = TestBed.inject(DeckStore);
    store.connect();
    socket.open();
    socket.emit({
      type: 'loggedIn',
      userName: 'tester',
      serverVersion: '1.4.50',
      mainRoomId: 'room-1',
    });
    return {
      socket,
      store,
      decks,

      serveDecks: (decks: DeckSummary[], builtIn: DeckSummary[] = []) =>
        socket.emit({ type: 'decks', decks, builtIn }),
      mount: () => {
        const fixture = TestBed.createComponent(DecksComponent);
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        const sync = () => fixture.detectChanges();
        const click = (label: string): void => {
          const button = [...element.querySelectorAll('button')].find(
            (candidate) => candidate.textContent?.trim() === label,
          );
          if (!button) throw new Error(`no button labelled "${label}"`);
          button.click();
          sync();
        };
        return { element, sync, click };
      },
    };
  }

  it('asks for the store on mount, because another session may have imported since', () => {
    const { socket, mount } = render();
    mount();

    expect(socket.lastSentOfType('listDecks')).toBeDefined();
  });

  it('sends the pasted text as an import, with the name given', () => {
    const { socket, decks } = render();
    decks.importDeck('1 Sol Ring\n1 Forest', 'My Deck');

    expect(socket.lastSentOfType('importDeck')).toMatchObject({
      text: '1 Sol Ring\n1 Forest',
      name: 'My Deck',
    });
    expect(decks.importPending()).toBe(true);
  });

  it('selects a deck the moment it imports, so nothing has to be picked twice', () => {
    const { socket, decks } = render();
    decks.importDeck('1 Sol Ring');
    socket.emit({
      type: 'deckImported',
      ok: true,
      name: 'Limit Break',
      deck: deck(),
      cardCount: 100,
    });

    expect(decks.selectedDeckId()).toBe('limit-break-3f9a2c');
    expect(decks.importPending()).toBe(false);

    expect(socket.lastSentOfType('listDecks')).toBeDefined();
  });

  it('keeps the reasons a failed import failed, and selects nothing', () => {
    const { socket, decks } = render();
    decks.importDeck('1 Sol Ring\n1 Nonsense');
    socket.emit({
      type: 'deckImported',
      ok: false,
      name: 'Imported deck',
      notes: [
        {
          level: 'ERROR',
          message: 'no card called "Nonsense" in this server\'s card database',
          lineNumber: 2,
        },
      ],
    });

    expect(decks.selectedDeckId()).toBeNull();
    expect(decks.lastImport()?.ok).toBe(false);
    expect(decks.lastImport()?.notes?.[0].lineNumber).toBe(2);
  });

  it('carries the chosen deck onto the frames that actually seat you', () => {
    const { socket, store, decks, serveDecks } = render();
    serveDecks([deck()]);
    decks.selectDeck('limit-break-3f9a2c');

    store.joinTable('table-1');
    store.quickGame(2);

    expect(socket.lastSentOfType('joinTable')).toMatchObject({
      tableId: 'table-1',
      deckId: 'limit-break-3f9a2c',
    });
    expect(socket.lastSentOfType('quickGame')).toMatchObject({
      aiOpponents: 2,
      deckId: 'limit-break-3f9a2c',
    });
  });

  it('omits deckId entirely when no deck is chosen', () => {
    const { socket, store } = render();
    store.joinTable('table-1');

    expect(socket.lastSentOfType('joinTable')).not.toHaveProperty('deckId');
  });

  it('drops a selection for a deck that has left the store', () => {
    const { decks, serveDecks } = render();
    serveDecks([deck()]);
    decks.selectDeck('limit-break-3f9a2c');

    serveDecks([]);

    expect(decks.selectedDeckId()).toBeNull();
  });

  it('lists the store with its commanders, alongside the ready shelf', () => {
    const { serveDecks, mount } = render();
    serveDecks([
      deck({
        commanders: [
          {
            name: "Tidus, Yuna's Guardian",
            setCode: 'FIC',
            cardNumber: '5',
            colors: ['W', 'U', 'G'],
          },
        ],
      }),
    ]);

    const { element } = mount();

    expect(element.textContent).toContain('Limit Break');

    const metas = [...element.querySelectorAll('.meta')].map((m) => m.textContent);
    expect(metas.some((text) => text?.includes("Tidus, Yuna's Guardian"))).toBe(true);
  });

  it('picks a deck from the grid', () => {
    const { decks, serveDecks, mount } = render();
    serveDecks([deck()]);
    const { click } = mount();

    click('Play this');
    expect(decks.selectedDeckId()).toBe('limit-break-3f9a2c');
  });

  it('offers the decks the server ships, and plays one by name', () => {
    const { socket, store, decks, serveDecks, mount } = render();
    serveDecks([], [deck({ deckId: 'limit-break', name: 'Limit Break (FINAL FANTASY VII)' })]);
    const { element, click } = mount();

    expect(element.textContent).toContain('Limit Break (FINAL FANTASY VII)');
    click('Play this');
    expect(decks.selectedDeckId()).toBe('limit-break');

    store.joinTable('table-1');
    expect(socket.lastSentOfType('joinTable')).toMatchObject({
      tableId: 'table-1',
      deckId: 'limit-break',
    });
  });

  it('omits the "My Decks" heading until an account has imported something', () => {
    const { serveDecks, mount } = render();
    serveDecks([], [deck({ deckId: 'limit-break', name: 'Limit Break' })]);

    const { element } = mount();
    const headings = [...element.querySelectorAll('.section-title')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Ready to Play']);
    expect(element.textContent).toContain('Limit Break');

    serveDecks(
      [deck({ deckId: 'imported', name: 'My First Deck' })],
      [deck({ deckId: 'limit-break', name: 'Limit Break' })],
    );
    const withImport = mount();
    const headingsAfter = [...withImport.element.querySelectorAll('.section-title')].map((h) =>
      h.textContent?.trim(),
    );

    expect(headingsAfter).toEqual(['My Decks', 'Ready to Play']);
  });

  it('shows the same decks as rows in list view, and remembers the choice', () => {
    const { serveDecks, mount } = render();
    serveDecks([deck()]);
    const first = mount();

    (first.element.querySelector('[aria-label="list view"]') as HTMLButtonElement).click();
    first.sync();
    expect(first.element.querySelectorAll('.row').length).toBe(1);
    expect(first.element.querySelectorAll('.grid').length).toBe(0);

    expect(mount().element.querySelectorAll('.row').length).toBe(1);
  });

  it('drops a selection for a built-in the server no longer offers', () => {
    const { decks, serveDecks } = render();
    serveDecks([], [deck({ deckId: 'limit-break' })]);
    decks.selectDeck('limit-break');

    serveDecks([], [deck({ deckId: 'counter-blitz' })]);

    expect(decks.selectedDeckId()).toBeNull();
  });

  it('survives a decks frame with no built-ins at all', () => {
    const { socket, decks, mount } = render();
    socket.emit({ type: 'decks', decks: [deck()] });

    expect(decks.builtInDecks()).toEqual([]);
    const { element } = mount();
    expect(element.textContent).toContain('Limit Break');
  });

  it('selects a deck on a click anywhere but View', () => {
    const { decks, serveDecks, mount } = render();
    serveDecks([deck()]);
    const { element } = mount();

    (element.querySelector('.deck') as HTMLElement).click();
    expect(decks.selectedDeckId()).toBe('limit-break-3f9a2c');
  });

  it('does not select a deck by clicking View', () => {
    const { decks, serveDecks, mount } = render();
    serveDecks([deck()]);
    const { element } = mount();

    const view = [...element.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'View')!;
    (view as HTMLElement).click();
    expect(decks.selectedDeckId()).toBeNull();
  });

  it('narrows the shelf by name or general on search', () => {
    const { serveDecks, mount } = render();
    serveDecks([
      deck({ deckId: 'a', name: 'Limit Break' }),
      deck({
        deckId: 'b',
        name: 'Counter Blitz',
        commanders: [{ name: 'Tidus', setCode: 'FIC', cardNumber: '5', colors: ['W'] }],
      }),
    ]);
    const { element, sync } = mount();

    const search = element.querySelector('[aria-label="search decks"]') as HTMLInputElement;
    search.value = 'tidus';
    search.dispatchEvent(new Event('input'));
    sync();

    expect(element.textContent).toContain('Counter Blitz');
    expect(element.textContent).not.toContain('Limit Break');
  });

  it('narrows the shelf by colour identity, matching exactly rather than merely including', () => {
    const { serveDecks, mount } = render();
    serveDecks([
      deck({
        deckId: 'a',
        name: 'Green Deck',
        commanders: [{ name: 'Gaea', setCode: 'X', cardNumber: '1', colors: ['G'] }],
      }),
      deck({
        deckId: 'b',
        name: 'Gruul Deck',
        commanders: [{ name: 'Domri', setCode: 'X', cardNumber: '2', colors: ['R', 'G'] }],
      }),
      deck({ deckId: 'c', name: 'Colourless Deck' }),
    ]);
    const { element, sync } = mount();

    const chip = [...element.querySelectorAll('.chip')].find(
      (c) => c.getAttribute('title') === 'G',
    )!;
    (chip as HTMLElement).click();
    sync();

    expect(element.textContent).toContain('Green Deck');
    expect(element.textContent).not.toContain('Gruul Deck');
    expect(element.textContent).not.toContain('Colourless Deck');
  });

  it('searches across both your decks and the ready-made shelf', () => {
    const { serveDecks, mount } = render();
    serveDecks(
      [deck({ deckId: 'a', name: 'Limit Break' })],
      [deck({ deckId: 'b', name: 'Counter Blitz (FINAL FANTASY VII)' })],
    );
    const { element, sync } = mount();

    const search = element.querySelector('[aria-label="search decks"]') as HTMLInputElement;
    search.value = 'final fantasy';
    search.dispatchEvent(new Event('input'));
    sync();

    expect(element.textContent).toContain('Counter Blitz (FINAL FANTASY VII)');
    expect(element.textContent).not.toContain('Limit Break');
  });

  it('says so when a search matches nothing, and clears back to the full shelf', () => {
    const { serveDecks, mount } = render();
    serveDecks([deck({ name: 'Limit Break' })]);
    const { element, sync } = mount();

    const search = element.querySelector('[aria-label="search decks"]') as HTMLInputElement;
    search.value = 'nothing like this';
    search.dispatchEvent(new Event('input'));
    sync();

    expect(element.textContent).toContain('No decks match');

    const clear = [...element.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Clear filters',
    )!;
    clear.click();
    sync();

    expect(element.textContent).toContain('Limit Break');
  });

  it('forces list view while filtering, and restores card view once the filter clears', () => {
    const { serveDecks, mount } = render();
    serveDecks([deck()]);
    const { element, sync } = mount();

    expect(element.querySelectorAll('.grid').length).toBe(1);
    expect(element.querySelectorAll('.rows').length).toBe(0);

    const search = element.querySelector('[aria-label="search decks"]') as HTMLInputElement;
    search.value = 'limit';
    search.dispatchEvent(new Event('input'));
    sync();

    expect(element.querySelectorAll('.rows').length).toBe(1);
    expect(element.querySelectorAll('.grid').length).toBe(0);
    const cardToggle = element.querySelector('[aria-label="card view"]') as HTMLButtonElement;
    const listToggle = element.querySelector('[aria-label="list view"]') as HTMLButtonElement;
    expect(cardToggle.disabled).toBe(true);
    expect(listToggle.disabled).toBe(true);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    sync();

    expect(element.querySelectorAll('.grid').length).toBe(1);
    expect(element.querySelectorAll('.rows').length).toBe(0);
    expect(cardToggle.disabled).toBe(false);
  });
});
