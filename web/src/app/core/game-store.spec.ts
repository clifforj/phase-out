import { PASS_AHEAD_ACTIONS } from './game-store';
import { GameStateMsg, GameStateView, SERVER_FRAME_TYPES } from './protocol';
import { FIXTURES } from '../testing/fixture';
import { fixtureNames, loadFixture } from '../testing/fixture-loader';
import { reconnect, replay, seatAsPlayer, setUp } from './testing-support';

describe('GameStore', () => {
  it('logs in with a fresh unique name on every connection', () => {
    const { socket } = setUp();
    const login = socket.lastSentOfType<{ userName: string }>('login');
    expect(login?.userName).toMatch(/^web-[a-z0-9]{4,}$/);

    expect(socket.sentFrames<{ type: string }>().filter((f) => f.type === 'login')).toHaveLength(1);

    reconnect(socket);
    const names = socket
      .sentFrames<{ type: string; userName?: string }>()
      .filter((frame) => frame.type === 'login')
      .map((frame) => frame.userName);
    expect(names).toHaveLength(2);
    expect(names[0]).not.toEqual(names[1]);
  });

  it('halts on a protocol version it does not implement', () => {
    const { socket, store } = setUp(null);
    socket.emit({
      type: 'hello',
      protocolVersion: 99,
      bridgeSessionId: 's',
      xmageServerHost: 'h',
      xmageServerPort: 1,
    });

    expect(store.protocolMismatch()).toContain('99');
    expect(store.status()).toBe('halted');

    expect(socket.lastSentOfType('login')).toBeUndefined();
    expect(socket.lastSentOfType('listTables')).toBeUndefined();
  });

  it('discovers the committed captures', () => {
    expect(fixtureNames()).toEqual(
      expect.arrayContaining([FIXTURES.spectatorDuel, FIXTURES.playerVsAi]),
    );
  });

  describe.each(fixtureNames())('replaying the %s capture', (name) => {
    it('handles every frame type in it, with no unknown types and no drift', () => {
      const { socket, store } = setUp();
      const lines = loadFixture(name);
      expect(lines.length).toBeGreaterThan(0);

      replay(
        socket,
        lines.map((line) => line.frame),
      );

      const drift = store.toasts().filter((toast) => toast.text.includes('unknown frame type'));
      expect(drift).toEqual([]);
      for (const line of lines) {
        expect(SERVER_FRAME_TYPES).toContain(line.frame.type);
      }
      expect(store.snapshot()).not.toBeNull();
    });

    it('never reports an unmapped callback', () => {
      const { socket, store } = setUp();
      replay(
        socket,
        loadFixture(name).map((line) => line.frame),
      );

      expect(store.unmapped()).toEqual([]);
    });
  });

  it('reads a spectator capture as a spectator: no hand, no player id, isPlayer false', () => {
    const { socket, store } = setUp();
    replay(
      socket,
      loadFixture(FIXTURES.spectatorDuel).map((line) => line.frame),
    );

    expect(store.role()).toBe('spectator');

    expect(['watching', 'over']).toContain(store.watchState());
    const game = store.snapshot()!;
    expect(game.isPlayer).toBe(false);
    expect(game.myPlayerId).toBeUndefined();
    expect(game.myHand).toEqual([]);
    expect(game.players.length).toBeGreaterThanOrEqual(2);

    expect(game.players.some((player) => player.isMe)).toBe(false);
  });

  it('replaces snapshots wholesale, so objects that leave a zone disappear', () => {
    const { socket, store } = setUp();
    const lines = loadFixture(FIXTURES.spectatorDuel);
    const states = lines.filter((line) => line.frame.type === 'gameState');
    replay(
      socket,
      states.map((line) => line.frame),
    );

    const lastFrame = states.at(-1)!.frame as GameStateMsg;

    expect(store.snapshot()).toEqual(lastFrame.game);

    const victim = lastFrame.game.players.flatMap((player) => player.battlefield)[0];
    expect(victim, 'the capture has no permanents to remove').toBeTruthy();

    socket.emit({
      ...lastFrame,
      game: {
        ...lastFrame.game,
        players: lastFrame.game.players.map((player) => ({
          ...player,
          battlefield: player.battlefield.filter((p) => p.card.objectId !== victim.card.objectId),
        })),
      },
    });

    const onBoard = store
      .snapshot()!
      .players.flatMap((player) => player.battlefield.map((p) => p.card.objectId));
    expect(onBoard).not.toContain(victim.card.objectId);
    expect(onBoard).toHaveLength(
      lastFrame.game.players.flatMap((player) => player.battlefield).length - 1,
    );
  });

  it('extracts the game log from chat, keeping GAME and STATUS and nothing else', () => {
    const { socket, store } = setUp();
    const lines = loadFixture(FIXTURES.spectatorDuel);
    replay(
      socket,
      lines.map((line) => line.frame),
    );

    const chats = lines.filter((line) => line.frame.type === 'chat');
    const expected = chats.filter((line) => {
      const type = (line.frame as { messageType?: string }).messageType;
      return type === 'GAME' || type === 'STATUS';
    });
    expect(store.log()).toHaveLength(expected.length);
    expect(store.log().length).toBeGreaterThan(0);

    for (const line of store.log()) {
      expect(line.text).not.toMatch(/<[a-z/]/i);
      expect(line.text).not.toContain('&nbsp;');
    }

    expect(store.log().some((line) => line.objectIds.length > 0)).toBe(true);
  });

  it('shows a finished game as a result rather than a frozen board', () => {
    const { socket, store } = setUp();
    replay(
      socket,
      loadFixture(FIXTURES.playerVsAi).map((line) => line.frame),
    );

    expect(store.watchState()).toBe('over');
    expect(store.result()?.text ?? store.result()?.matchInfo).toBeTruthy();

    expect(store.snapshot()).not.toBeNull();
  });

  it('surfaces a failure, and reads a refused watch after the game ended as "over"', () => {
    const { socket, store } = setUp();
    socket.emit({
      type: 'hello',
      protocolVersion: 1,
      bridgeSessionId: 's',
      xmageServerHost: 'h',
      xmageServerPort: 1,
    });
    socket.emit({ type: 'loggedIn', userName: 'watch-1', serverVersion: 'v', mainRoomId: 'room' });
    store.watch('table-1');

    const first = loadFixture(FIXTURES.spectatorDuel).find(
      (line) => line.frame.type === 'gameState',
    )!;
    socket.emit(first.frame);

    socket.emit({
      type: 'failure',
      action: 'watchTable',
      reason:
        'no table table-1 in room room; a finished table leaves the lobby, so the game may simply be over',
    });

    expect(store.watchState()).toBe('over');
    expect(store.failures()).toHaveLength(1);
    expect(store.toasts().some((toast) => toast.level === 'ERROR')).toBe(true);
  });

  it('treats an unmapped frame as a loud, distinct condition', () => {
    const { socket, store } = setUp();
    socket.emit({
      type: 'unmapped',
      callbackMethod: 'START_DRAFT',
      payloadClass: 'mage.view.DraftClientMessage',
    });
    socket.emit({
      type: 'unmapped',
      callbackMethod: 'START_DRAFT',
      payloadClass: 'mage.view.DraftClientMessage',
    });

    expect(store.unmapped()).toEqual([
      { callbackMethod: 'START_DRAFT', payloadClass: 'mage.view.DraftClientMessage', count: 2 },
    ]);
  });

  it('separates an XMage drop from the socket closing', () => {
    const { socket, store } = setUp();
    expect(store.xmageDropped()).toBe(false);
    socket.emit({ type: 'disconnected', askToReconnect: true, keepSessionActive: false });
    expect(store.xmageDropped()).toBe(true);
    expect(store.status()).toBe('open');
  });

  it('re-issues watchTable after a reconnect, without being asked again', () => {
    const { socket, store } = setUp();
    socket.emit({ type: 'loggedIn', userName: 'watch-1', serverVersion: 'v', mainRoomId: 'room' });
    store.watch('table-7');
    expect(socket.lastSentOfType<{ tableId: string }>('watchTable')?.tableId).toBe('table-7');

    reconnect(socket);
    socket.emit({ type: 'loggedIn', userName: 'watch-2', serverVersion: 'v', mainRoomId: 'room' });

    const watches = socket
      .sentFrames<{ type: string; tableId?: string }>()
      .filter((f) => f.type === 'watchTable');
    expect(watches).toHaveLength(2);
    expect(watches[1].tableId).toBe('table-7');
  });

  it('asks for the deck store on login, so a page refresh does not empty the picker', () => {
    const { socket } = setUp();

    socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });
    expect(socket.lastSentOfType('listDecks')).toBeDefined();

    reconnect(socket);
    socket.emit({ type: 'loggedIn', userName: 'web-2', serverVersion: 'v', mainRoomId: 'room' });
    const asks = socket
      .sentFrames<{ type: string }>()
      .filter((frame) => frame.type === 'listDecks');
    expect(asks).toHaveLength(2);
  });

  describe('seating', () => {
    it('createTable auto-joins as human once tableCreated confirms the table exists', () => {
      const { socket, store } = setUp();
      socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });

      store.createTable({ players: 2, aiOpponents: 0 });
      expect(
        socket.lastSentOfType<{ players: number; aiOpponents: number }>('createTable'),
      ).toMatchObject({
        players: 2,
        aiOpponents: 0,
      });

      socket.emit({
        type: 'tableCreated',
        roomId: 'room',
        tableId: 't1',
        gameType: 'x',
        deckType: 'y',
        seats: [],
      });
      expect(store.myTableId()).toBe('t1');
      expect(socket.lastSentOfType<{ tableId: string }>('joinTable')?.tableId).toBe('t1');
    });

    it('createTable forgets the game that has just finished', () => {
      const { socket, store } = setUp();
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });
      socket.emit({ type: 'gameOver', gameId: 'g1', text: 'tester has won the game' });
      expect(store.gameId()).toBe('g1');

      store.createTable({ players: 2, aiOpponents: 0 });

      expect(store.gameId()).toBeNull();
      expect(store.role()).toBeNull();
      expect(store.myTableId()).toBeNull();
      expect(store.snapshot()).toBeNull();
      expect(store.watchState()).toBe('idle');

      expect(socket.lastSentOfType('createTable')).toBeDefined();
    });

    it('joinTable forgets it too, then remembers the table being sat at', () => {
      const { socket, store } = setUp();
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });
      socket.emit({ type: 'gameOver', gameId: 'g1', text: 'tester has won the game' });

      store.joinTable('t9');

      expect(store.gameId()).toBeNull();
      expect(store.role()).toBeNull();
      expect(store.myTableId()).toBe('t9');
    });

    it('joinTable remembers the table id immediately, before any server confirmation', () => {
      const { socket, store } = setUp();
      store.joinTable('t2');
      expect(store.myTableId()).toBe('t2');
      expect(socket.lastSentOfType<{ tableId: string }>('joinTable')?.tableId).toBe('t2');
    });

    it('quickGame fills in myTableId from gameStarted, since it never calls joinTable itself', () => {
      const { socket, store } = setUp();
      store.quickGame(1);
      expect(socket.lastSentOfType('quickGame')).toBeTruthy();
      expect(store.myTableId()).toBeNull();

      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't3',
        myPlayerId: 'p1',
        role: 'player',
      });
      expect(store.myTableId()).toBe('t3');
      expect(store.myPlayerId()).toBe('p1');
    });
  });

  describe('rejoinPrompt (a seat XMage restores that this tab never asked for)', () => {
    it('is set when gameStarted arrives for a player seat with no lobby action behind it', () => {
      const { socket, store } = setUp();
      socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });

      expect(store.rejoinPrompt()).toBe('t1');
    });

    it('clearRejoinPrompt resets it to null', () => {
      const { socket, store } = setUp();
      socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });
      store.clearRejoinPrompt();

      expect(store.rejoinPrompt()).toBeNull();
    });

    it('is not set for a spectator watch', () => {
      const { socket, store } = setUp();
      socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });
      socket.emit({ type: 'gameStarted', gameId: 'g1', tableId: 't1', role: 'spectator' });

      expect(store.rejoinPrompt()).toBeNull();
    });

    it("is not set for quickGame's own gameStarted, since this tab asked for that game itself", () => {
      const { socket, store } = setUp();
      socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });
      store.quickGame(1);
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });

      expect(store.rejoinPrompt()).toBeNull();
    });

    it("is not set for joinTable's own gameStarted", () => {
      const { socket, store } = setUp();
      socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });
      store.joinTable('t1');
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });

      expect(store.rejoinPrompt()).toBeNull();
    });

    it('fires again on a genuine reconnect after a lobby action from the previous login', () => {
      const { socket, store } = setUp();
      socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });
      store.joinTable('t1');
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });
      expect(store.rejoinPrompt()).toBeNull();

      reconnect(socket);
      socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });

      expect(store.rejoinPrompt()).toBe('t1');
    });
  });

  describe('game actions', () => {
    it('does nothing without a gameId', () => {
      const { socket, store } = setUp();
      store.passPriority();
      expect(socket.lastSentOfType('passPriority')).toBeUndefined();
    });

    it('sends the game id with every action', () => {
      const { socket, store } = setUp();
      seatAsPlayer(socket);
      store.activate('card-1');
      expect(socket.lastSentOfType<{ gameId: string; objectId: string }>('activate')).toEqual({
        type: 'activate',
        gameId: 'g1',
        objectId: 'card-1',
      });
    });

    it('clears the outstanding prompt after an action that answers it, so the action bar goes back to waiting', () => {
      const { socket, store } = setUp();
      seatAsPlayer(socket);
      socket.emit({
        type: 'prompt',
        gameId: 'g1',
        prompt: {
          kind: 'GAME_SELECT',
          required: false,
          cards: [],
          cards2: [],
          selectableTargets: [],
          chosenTargets: [],
          choices: [],
          amounts: [],
          possibleAttackers: [],
          possibleBlockers: [],
          expects: ['activate', 'passPriority', 'special'],
        },
      });
      expect(store.prompt()).not.toBeNull();
      expect(store.needsAction()).toBe(true);

      store.passPriority();
      expect(store.prompt()).toBeNull();
      expect(store.needsAction()).toBe(false);
    });

    it('does not clear the prompt for chooseTarget — a multi-target pick re-prompts with updated chosenTargets', () => {
      const { socket, store } = setUp();
      seatAsPlayer(socket);
      const prompt = {
        kind: 'GAME_TARGET' as const,
        required: true,
        cards: [],
        cards2: [],
        selectableTargets: ['a', 'b'],
        chosenTargets: [],
        choices: [],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['chooseTarget', 'cancel'],
      };
      socket.emit({ type: 'prompt', gameId: 'g1', prompt });

      store.chooseTarget('a');

      expect(store.prompt()).toEqual(prompt);
      expect(socket.lastSentOfType<{ targetId: string }>('chooseTarget')?.targetId).toBe('a');
    });

    describe('playerAction / activeSkip', () => {
      it('tracks which pass-ahead shortcut was last sent, and forwards it as a plain PlayerAction', () => {
        const { socket, store } = setUp();
        seatAsPlayer(socket);

        store.playerAction('PASS_PRIORITY_UNTIL_TURN_END_STEP');
        expect(store.activeSkip()).toBe('endOfTurn');
        expect(socket.lastSentOfType<{ action: string }>('playerAction')?.action).toBe(
          'PASS_PRIORITY_UNTIL_TURN_END_STEP',
        );

        store.playerAction('PASS_PRIORITY_CANCEL_ALL_ACTIONS');
        expect(store.activeSkip()).toBeNull();
      });

      it('maps "pass to my next turn" onto XMage\'s F9, not F4', () => {
        expect(PASS_AHEAD_ACTIONS.nextTurn).toBe('PASS_PRIORITY_UNTIL_MY_NEXT_TURN');
      });

      it('is legal with no outstanding prompt, unlike every other game action', () => {
        const { socket, store } = setUp();
        seatAsPlayer(socket);
        expect(store.prompt()).toBeNull();

        store.playerAction('PASS_PRIORITY_UNTIL_MY_NEXT_TURN');
        expect(store.activeSkip()).toBe('nextTurn');
        expect(socket.lastSentOfType('playerAction')).toBeTruthy();
      });

      it('clears once a real prompt arrives — XMage never announces a skip stopping, only asks again', () => {
        const { socket, store } = setUp();
        seatAsPlayer(socket);
        store.playerAction('PASS_PRIORITY_UNTIL_MY_NEXT_TURN');
        expect(store.activeSkip()).toBe('nextTurn');

        socket.emit({
          type: 'prompt',
          gameId: 'g1',
          prompt: {
            kind: 'GAME_SELECT',
            required: false,
            cards: [],
            cards2: [],
            selectableTargets: [],
            chosenTargets: [],
            choices: [],
            amounts: [],
            possibleAttackers: [],
            possibleBlockers: [],
            expects: ['activate', 'passPriority', 'special'],
          },
        });
        expect(store.activeSkip()).toBeNull();
      });

      it('does nothing without a gameId', () => {
        const { socket, store } = setUp();
        store.playerAction('PASS_PRIORITY_UNTIL_MY_NEXT_TURN');
        expect(socket.lastSentOfType('playerAction')).toBeUndefined();
        expect(store.activeSkip()).toBeNull();
      });
    });
  });

  describe('elimination in a pod', () => {
    function seat(playerId: string, isMe: boolean, hasLeft: boolean, life: number) {
      return {
        playerId,
        name: playerId,
        life,
        isMe,
        isHuman: true,
        isActive: false,
        hasPriority: false,
        hasLeft,
        libraryCount: 80,
        handCount: 3,
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
      };
    }

    function pod(meHasLeft: boolean): GameStateView {
      return {
        turn: 12,
        isPlayer: true,
        specialActionAvailable: false,
        myPlayerId: 'p1',
        myHand: [],
        stack: [],
        combat: [],
        playable: [],
        players: [
          seat('p1', true, meHasLeft, meHasLeft ? 0 : 22),
          seat('p2', false, false, 31),
          seat('p3', false, false, 18),
        ],
      };
    }

    function seatedPod(meHasLeft: boolean) {
      const { socket, store } = setUp();
      socket.emit({
        type: 'gameStarted',
        gameId: 'g1',
        tableId: 't1',
        myPlayerId: 'p1',
        role: 'player',
      });
      socket.emit({ type: 'gameState', gameId: 'g1', game: pod(meHasLeft) } as GameStateMsg);
      return { socket, store };
    }

    it('is not eliminated while still in the game', () => {
      const { store } = seatedPod(false);
      expect(store.mySeat()?.playerId).toBe('p1');
      expect(store.eliminated()).toBe(false);
    });

    it('is eliminated once its own seat has left, while the pod plays on', () => {
      const { store } = seatedPod(true);
      expect(store.eliminated()).toBe(true);

      expect(store.snapshot()?.players.length).toBe(3);
    });

    it('stops once the game is actually over, which has a result of its own', () => {
      const { socket, store } = seatedPod(true);
      socket.emit({ type: 'gameOver', gameId: 'g1', text: 'p2 has won the game' });
      expect(store.eliminated()).toBe(false);
    });

    it('never applies to a spectator, who has no seat to lose', () => {
      const { socket, store } = setUp();
      socket.emit({ type: 'gameStarted', gameId: 'g1', tableId: 't1', role: 'spectator' });

      socket.emit({
        type: 'gameState',
        gameId: 'g1',
        game: { ...pod(true), players: pod(true).players.map((p) => ({ ...p, isMe: false })) },
      } as GameStateMsg);
      expect(store.mySeat()).toBeNull();
      expect(store.eliminated()).toBe(false);
    });
  });
});
