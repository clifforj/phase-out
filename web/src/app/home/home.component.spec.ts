import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HomeComponent } from './home.component';
import { BRIDGE_SOCKET_FACTORY } from '../core/bridge-socket';
import { DeckStore } from '../core/deck-store';
import { GameStore } from '../core/game-store';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';

describe('HomeComponent', () => {
  function render() {
    localStorage.clear();
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
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

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
      navigate,
      mount: () => {
        const fixture = TestBed.createComponent(HomeComponent);
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        const sync = () => fixture.detectChanges();
        return { element, ...actions(element, sync) };
      },
    };
  }

  function actions(element: HTMLElement, sync: () => void) {
    const clickIn = (scope: string, label: string): void => {
      const root = scope ? element.querySelector(scope) : element;
      if (!root) throw new Error(`nothing matching "${scope}" on screen`);
      const button = [...root.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      if (!button) throw new Error(`no button labelled "${label}" in "${scope || 'the page'}"`);
      button.click();
      sync();
    };
    return {
      sync,

      mode: (label: string) => clickIn('.modes', label),

      step: (glyph: '–' | '+', times: number) => {
        for (let index = 0; index < times; index++) clickIn('.stepper', glyph);
      },

      go: () => {
        (element.querySelector('.go') as HTMLButtonElement).click();
        sync();
      },
      seats: () => element.querySelector('.count')?.textContent?.trim(),

      pickDeck: (name: string) => {
        (element.querySelector('.deck-trigger') as HTMLButtonElement).click();
        sync();
        const row = [...element.querySelectorAll('.deck-row')].find((candidate) =>
          candidate.textContent?.includes(name),
        );
        if (!row) throw new Error(`no deck row for "${name}"`);
        (row as HTMLButtonElement).click();
        sync();
      },
    };
  }

  function playAndFinishAGame(socket: FakeSocket): void {
    socket.emit({
      type: 'gameStarted',
      gameId: 'game-1',
      tableId: 'table-1',
      myPlayerId: 'me',
      role: 'player',
    });
    socket.emit({ type: 'gameOver', gameId: 'game-1', text: 'tester has won the game' });
  }

  it('stays put when it is reached from a game that has already finished', () => {
    const { socket, navigate, mount } = render();
    playAndFinishAGame(socket);

    mount();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not bounce back to a game left mid-play either', () => {
    const { socket, navigate, mount } = render();
    socket.emit({
      type: 'gameStarted',
      gameId: 'game-1',
      tableId: 'table-1',
      myPlayerId: 'me',
      role: 'player',
    });

    mount();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('creates a genuinely new table after a finished game', () => {
    const { socket, store, navigate, mount } = render();
    playAndFinishAGame(socket);
    const { mode, go, sync } = mount();

    mode('Create Room');
    go();
    expect(store.gameId()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();

    socket.emit({
      type: 'tableCreated',
      roomId: 'room-1',
      tableId: 'table-2',
      gameType: 'Commander Two Player Duel',
      deckType: 'Variant Magic - Commander',
      seats: [{ playerType: 'HUMAN' }, { playerType: 'HUMAN' }],
    });
    sync();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/table', 'table-2']);
  });

  describe('seat count', () => {
    it('creates a table for two as a duel by default', () => {
      const { socket, mount } = render();
      const { mode, go } = mount();

      mode('Create Room');
      go();

      expect(socket.lastSentOfType('createTable')).toMatchObject({
        players: 2,
        aiOpponents: 0,
        gameType: 'Commander Two Player Duel',
      });
    });

    it('creates a four-seat table as a free-for-all', () => {
      const { socket, mount } = render();
      const { mode, step, go } = mount();

      mode('Create Room');
      step('+', 2);
      go();

      expect(socket.lastSentOfType('createTable')).toMatchObject({
        players: 4,
        aiOpponents: 0,
        gameType: 'Commander Free For All',
      });
    });

    it('fills the other seats with AI for a quick pod', () => {
      const { socket, mount } = render();
      const { step, go } = mount();

      step('+', 2);
      go();

      expect(socket.lastSentOfType('quickGame')).toMatchObject({
        aiOpponents: 3,
        gameType: 'Commander Free For All',
      });
    });

    it('remembers the size chosen, for the next visit and for Settings', () => {
      const { mount } = render();
      const first = mount();
      first.mode('Create Room');
      first.step('+', 2);
      first.go();

      expect(mount().seats()).toBe('4');
    });

    it('will not step past six seats, or below two', () => {
      const { socket, mount } = render();
      const { mode, step, go, seats } = mount();

      mode('Create Room');
      step('+', 9);
      expect(seats()).toBe('6');
      go();
      expect(socket.lastSentOfType('createTable')).toMatchObject({ players: 6 });

      step('–', 9);
      expect(seats()).toBe('2');
      go();
      expect(socket.lastSentOfType('createTable')).toMatchObject({ players: 2 });
    });

    it('sends the room name it was given, and nothing when it was left blank', () => {
      const { socket, mount } = render();
      const { element, mode, go, sync } = mount();

      mode('Create Room');
      go();
      expect(socket.lastSentOfType<{ name?: string }>('createTable')?.name).toBeUndefined();

      const field = element.querySelector('input[aria-label="room name"]') as HTMLInputElement;
      field.value = 'Sunday EDH Pod';
      field.dispatchEvent(new Event('input'));
      sync();
      go();

      expect(socket.lastSentOfType('createTable')).toMatchObject({ name: 'Sunday EDH Pod' });
    });
  });

  it('goes to the board when a quick match actually starts a game', () => {
    const { socket, navigate, mount } = render();
    const { go, sync } = mount();

    go();
    expect(socket.lastSentOfType('quickGame')).toBeDefined();

    socket.emit({
      type: 'gameStarted',
      gameId: 'game-1',
      tableId: 'table-1',
      myPlayerId: 'me',
      role: 'player',
    });
    sync();

    expect(navigate).toHaveBeenCalledWith(['/game', 'table-1']);
  });

  it('waits for the new game, not the finished one, when a quick match follows a game', () => {
    const { socket, navigate, mount } = render();
    playAndFinishAGame(socket);
    const { go, sync } = mount();

    go();

    socket.emit({
      type: 'tableCreated',
      roomId: 'room-1',
      tableId: 'table-2',
      gameType: 'Commander Free For All',
      deckType: 'Variant Magic - Commander',
      seats: [{ playerType: 'HUMAN' }, { playerType: 'COMPUTER_MAD' }],
    });
    sync();
    expect(navigate).not.toHaveBeenCalled();

    socket.emit({
      type: 'gameStarted',
      gameId: 'game-2',
      tableId: 'table-2',
      myPlayerId: 'me',
      role: 'player',
    });
    sync();

    expect(navigate).toHaveBeenCalledWith(['/game', 'table-2']);
  });

  describe('the deck picker', () => {
    const tidus = {
      deckId: 'limit-break',
      name: 'Limit Break',
      cardCount: 100,
      commanders: [
        {
          name: "Tidus, Yuna's Guardian",
          setCode: 'FIC',
          cardNumber: '5',
          colors: ['W', 'U', 'G'],
        },
      ],
    };
    const peace = { deckId: 'peace-offering', name: 'Peace Offering', cardCount: 100 };

    function serveDecks(socket: FakeSocket, builtIn: unknown[] = [tidus, peace]): void {
      socket.emit({ type: 'decks', decks: [], builtIn });
    }

    it('names the picked deck on the trigger, with a pip per colour', () => {
      const { socket, decks, mount } = render();
      const { element, sync } = mount();
      serveDecks(socket);
      decks.selectDeck('limit-break');
      sync();

      const trigger = element.querySelector('.deck-trigger')!;
      expect(trigger.textContent).toContain('Limit Break');
      expect(trigger.querySelectorAll('.pip').length).toBe(3);
      expect(trigger.textContent).not.toContain('Peace Offering');
    });

    it('says what happens instead when nothing is picked', () => {
      const { socket, mount } = render();
      const { element } = mount();
      serveDecks(socket);

      expect(element.querySelector('.deck-trigger')?.textContent).toContain('Deal me one');
    });

    it('picks a deck, and goes back to the pool from the same list', () => {
      const { socket, decks, mount } = render();
      const { pickDeck } = mount();
      serveDecks(socket);

      pickDeck('Limit Break');
      expect(decks.selectedDeckId()).toBe('limit-break');

      pickDeck('Deal me one');
      expect(decks.selectedDeckId()).toBeNull();
    });

    it('filters the list by what is typed', () => {
      const { socket, mount } = render();
      const { element, sync } = mount();
      serveDecks(socket);
      (element.querySelector('.deck-trigger') as HTMLButtonElement).click();
      sync();

      const search = element.querySelector('.search') as HTMLInputElement;
      search.value = 'peace';
      search.dispatchEvent(new Event('input'));
      sync();

      const names = [...element.querySelectorAll('.deck-row')].map((row) =>
        row.querySelector('.deck-name')?.textContent?.trim(),
      );

      expect(names).toEqual(['Deal me one', 'Peace Offering']);
    });
  });

  describe('the rooms grid', () => {
    function table(overrides: Record<string, unknown> = {}) {
      return {
        tableId: 'table-9',
        name: "Cedric's Casual Room",
        controllerName: 'Cedric',
        gameType: 'Commander Free For All',
        deckType: 'Variant Magic - Commander',
        state: 'Waiting for players',
        stateCode: 'WAITING',
        seatsInfo: '1/4',
        isTournament: false,
        passworded: false,
        seats: [
          { playerType: 'HUMAN', playerName: 'Cedric' },
          { playerType: 'HUMAN' },
          { playerType: 'HUMAN' },
          { playerType: 'HUMAN' },
        ],
        gameIds: [],
        ...overrides,
      };
    }

    function roomButton(element: HTMLElement, label: string): HTMLButtonElement | undefined {
      return [...element.querySelectorAll('.room button')].find(
        (button) => button.textContent?.trim() === label,
      ) as HTMLButtonElement | undefined;
    }

    it('joins a waiting table and goes to its waiting room', () => {
      const { socket, navigate, mount } = render();
      const { element, sync } = mount();
      socket.emit({ type: 'tables', roomId: 'room-1', tables: [table()] });
      sync();

      roomButton(element, 'Join')!.click();
      sync();

      const confirmButton = [...element.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Join Table',
      );
      confirmButton!.click();

      expect(socket.lastSentOfType('joinTable')).toMatchObject({ tableId: 'table-9' });
      expect(navigate).toHaveBeenCalledWith(['/table', 'table-9']);
    });

    it('offers Watch, and not Join, once the table is dueling', () => {
      const { socket, navigate, mount } = render();
      const { element, sync } = mount();
      socket.emit({
        type: 'tables',
        roomId: 'room-1',
        tables: [table({ stateCode: 'DUELING', state: 'Dueling' })],
      });
      sync();

      expect(roomButton(element, 'Join')).toBeUndefined();
      roomButton(element, 'Watch')!.click();

      expect(navigate).toHaveBeenCalledWith(['/game', 'table-9']);
      expect(socket.lastSentOfType('joinTable')).toBeUndefined();
    });

    it('refuses a full table rather than sending a join that would be turned down', () => {
      const { socket, mount } = render();
      const { element, sync } = mount();
      socket.emit({
        type: 'tables',
        roomId: 'room-1',
        tables: [
          table({
            seats: [
              { playerType: 'HUMAN', playerName: 'Cedric' },
              { playerType: 'HUMAN', playerName: 'Lina' },
            ],
          }),
        ],
      });
      sync();

      expect(roomButton(element, 'Join')!.disabled).toBe(true);
    });
  });
});
