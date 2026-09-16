import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { DeckDetailComponent } from './deck-detail.component';
import { BRIDGE_SOCKET_FACTORY } from '../core/bridge-socket';
import { DeckStore } from '../core/deck-store';
import { GameStore } from '../core/game-store';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';
import type { DeckDetail, DeckSummary } from '../core/protocol';

describe('DeckDetailComponent', () => {
  function summary(overrides: Partial<DeckSummary> = {}): DeckSummary {
    return { deckId: 'limit-break-3f9a2c', name: 'Limit Break', cardCount: 1, ...overrides };
  }

  function detailFrame(overrides: Partial<DeckDetail> = {}): DeckDetail {
    return {
      type: 'deckDetail',
      deckId: 'limit-break-3f9a2c',
      name: 'Limit Break',
      cardCount: 1,
      cards: [
        {
          name: 'Sol Ring',
          amount: 1,
          setCode: 'C21',
          cardNumber: '263',
          category: 'Artifacts',
        },
      ],
      ...overrides,
    };
  }

  function render() {
    const socket = new FakeSocket();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) },
      ],
    });
    const store = TestBed.inject(GameStore);
    const decks = TestBed.inject(DeckStore);
    const router = TestBed.inject(Router);
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
      router,
      mount: (deckId: string) => {
        const fixture = TestBed.createComponent(DeckDetailComponent);
        fixture.componentRef.setInput('deckId', deckId);
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

  it('offers Delete for a deck you own', () => {
    const { socket, mount } = render();
    socket.emit({ type: 'decks', decks: [summary()], builtIn: [] });
    const { element, sync } = mount('limit-break-3f9a2c');
    socket.emit(detailFrame());
    sync();

    const labels = [...element.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toContain('Delete deck');
  });

  it('offers no way to delete a deck the server ships', () => {
    const { socket, mount } = render();
    socket.emit({ type: 'decks', decks: [], builtIn: [summary({ deckId: 'limit-break' })] });
    const { element, sync } = mount('limit-break');
    socket.emit(detailFrame({ deckId: 'limit-break' }));
    sync();

    const labels = [...element.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Delete deck');
  });

  it('does nothing until the modal is confirmed', () => {
    const { socket, mount } = render();
    socket.emit({ type: 'decks', decks: [summary()], builtIn: [] });
    const { element, sync, click } = mount('limit-break-3f9a2c');
    socket.emit(detailFrame());
    sync();

    click('Delete deck');
    expect(element.querySelector('[role="dialog"]')).toBeTruthy();
    expect(socket.lastSentOfType('deleteDeck')).toBeUndefined();

    click('Cancel');
    expect(element.querySelector('[role="dialog"]')).toBeFalsy();
    expect(socket.lastSentOfType('deleteDeck')).toBeUndefined();
  });

  it('deletes and returns to the grid once the modal is confirmed', () => {
    const { socket, decks, router, mount } = render();
    socket.emit({ type: 'decks', decks: [summary()], builtIn: [] });
    const { sync, click } = mount('limit-break-3f9a2c');
    socket.emit(detailFrame());
    sync();
    decks.selectDeck('limit-break-3f9a2c');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    click('Delete deck');
    click('Delete');

    expect(socket.lastSentOfType('deleteDeck')).toMatchObject({ deckId: 'limit-break-3f9a2c' });

    expect(decks.selectedDeckId()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/decks']);
  });

  it('shows one partner commander full-size and the other collapsed to its name, swapping on click', () => {
    const { socket, mount } = render();
    socket.emit({ type: 'decks', decks: [summary()], builtIn: [] });
    const { element, sync } = mount('limit-break-3f9a2c');
    socket.emit(
      detailFrame({
        cards: [
          {
            name: 'Tymna the Weaver',
            amount: 1,
            setCode: 'C16',
            cardNumber: '30',
            category: 'Creatures',
            commander: true,
          },
          {
            name: "Kraum, Ludevic's Opus",
            amount: 1,
            setCode: 'C16',
            cardNumber: '31',
            category: 'Creatures',
            commander: true,
          },
        ],
      }),
    );
    sync();

    expect(element.querySelector('.commander .commander-name')?.textContent?.trim()).toBe(
      'Tymna the Weaver',
    );
    const collapsed = element.querySelector('.commander-collapsed');
    expect(collapsed?.textContent).toContain("Kraum, Ludevic's Opus");

    (collapsed as HTMLButtonElement).click();
    sync();

    expect(element.querySelector('.commander .commander-name')?.textContent?.trim()).toBe(
      "Kraum, Ludevic's Opus",
    );
    expect(element.querySelector('.commander-collapsed')?.textContent).toContain(
      'Tymna the Weaver',
    );
  });
});
