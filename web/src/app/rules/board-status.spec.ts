import { TestBed } from '@angular/core/testing';
import { BRIDGE_SOCKET_FACTORY } from '../core/bridge-socket';
import { GameStore } from '../core/game-store';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';
import { boardBanner } from './board-status';

describe('boardBanner', () => {
  function setUp() {
    const socket = new FakeSocket();
    TestBed.configureTestingModule({
      providers: [{ provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) }],
    });
    const store = TestBed.inject(GameStore);
    store.connect();
    socket.open();
    return { socket, store, banner: TestBed.runInInjectionContext(() => boardBanner(store)) };
  }

  function eliminatedInAPod(socket: FakeSocket): void {
    const seat = (playerId: string, isMe: boolean, hasLeft: boolean) => ({
      playerId,
      name: playerId,
      life: hasLeft ? 0 : 25,
      isMe,
      isHuman: true,
      isActive: false,
      hasPriority: false,
      hasLeft,
      libraryCount: 80,
      handCount: 0,
      wins: 0,
      winsNeeded: 1,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      battlefield: [],
      graveyard: [],
      exile: [],
      commandZone: [],
      counters: [],
      designations: [],
      monarch: false,
      initiative: false,
    });
    socket.emit({
      type: 'gameStarted',
      gameId: 'g1',
      tableId: 't1',
      myPlayerId: 'p1',
      role: 'player',
    });
    socket.emit({
      type: 'gameState',
      gameId: 'g1',
      game: {
        turn: 9,
        isPlayer: true,
        specialActionAvailable: false,
        myPlayerId: 'p1',
        myHand: [],
        stack: [],
        combat: [],
        playable: [],
        players: [seat('p1', true, true), seat('p2', false, false), seat('p3', false, false)],
      },
    } as never);
  }

  it('says nothing while the game is ordinary', () => {
    const { banner } = setUp();
    expect(banner()).toBeNull();
  });

  it('explains that an eliminated player is still watching', () => {
    const { socket, banner } = setUp();
    eliminatedInAPod(socket);
    expect(banner()).toEqual({
      level: 'info',
      text: 'You are out of this game. The rest of the pod plays on - you are watching now.',
    });
  });

  it('yields to a fault, which is the more urgent thing to say', () => {
    const { socket, banner } = setUp();
    eliminatedInAPod(socket);

    socket.emit({ type: 'unmapped', callbackMethod: 'SOMETHING_NEW', count: 1 } as never);
    expect(banner()?.level).toBe('warn');
    expect(banner()?.text).toContain('SOMETHING_NEW');
  });
});
