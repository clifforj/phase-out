import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BRIDGE_SOCKET_FACTORY } from '../core/bridge-socket';
import { GameStore } from '../core/game-store';
import type { GameStateView, ServerFrame } from '../core/protocol';
import { stripTags } from '../rules/text-format';
import { splitManaText } from '../rules/mana-symbol';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';
import { FIXTURES } from '../testing/fixture';
import { loadFixture } from '../testing/fixture-loader';
import { EVENT_FEED_MAX } from './overlay/event-feed.component';
import { BoardComponent } from './board.component';
import { LIFE_FLASH_MS } from './life-flash';

describe('BoardComponent', () => {
  function setUp(frames: ServerFrame[]) {
    const socket = new FakeSocket();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) },
      ],
    });

    const fixture = TestBed.createComponent(BoardComponent);
    fixture.componentRef.setInput('tableId', 'table-under-test');
    fixture.detectChanges();

    socket.open();
    for (const frame of frames) socket.emit(frame);
    fixture.detectChanges();

    return {
      socket,
      fixture,
      store: TestBed.inject(GameStore),
      text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
      element: fixture.nativeElement as HTMLElement,
    };
  }

  const spectatorFrames = () => loadFixture(FIXTURES.spectatorDuel).map((line) => line.frame);

  function lastGame(frames: ServerFrame[]): GameStateView {
    const states = frames.filter((frame) => 'game' in frame && frame.game);
    return (states.at(-1) as { game: GameStateView }).game;
  }

  function longestProse(rules: readonly string[], sourceName?: string): string {
    return (
      rules
        .flatMap((line) => splitManaText(stripTags(line, sourceName)))
        .map((run) => run.text?.trim() ?? '')
        .sort((a, b) => b.length - a.length)[0] ?? ''
    );
  }

  it('asks to watch the table in the URL, without being told twice', () => {
    const { socket, store } = setUp([
      {
        type: 'hello',
        protocolVersion: 1,
        bridgeSessionId: 's',
        xmageServerHost: 'h',
        xmageServerPort: 1,
      },
      { type: 'loggedIn', userName: 'watch-1', serverVersion: 'v', mainRoomId: 'room' },
    ]);
    expect(store.watchTableId()).toBe('table-under-test');
    expect(socket.lastSentOfType<{ tableId: string }>('watchTable')?.tableId).toBe(
      'table-under-test',
    );
  });

  it('renders the readable half of the board as HTML, not as pixels', () => {
    const frames = spectatorFrames();
    const { text, element, fixture, store } = setUp(frames);
    const game = lastGame(frames);

    expect(text()).toContain(`turn ${game.turn}`);
    expect(text()).toContain(game.phase!);
    element.querySelector<HTMLButtonElement>('.phase-trigger')?.click();
    fixture.detectChanges();
    expect(text()).toContain(game.step!);

    expect(element.querySelectorAll('app-seat-hud').length).toBe(game.players.length);
    for (const player of game.players) {
      expect(text()).toContain(player.name);
      expect(text()).toContain(String(player.life));
    }

    expect(element.querySelector('.log-tab')?.textContent).toContain(String(store.log().length));
    expect(element.querySelector('app-game-log')).toBeNull();
  });

  it('opens the game log on request, and closes it again', () => {
    const { fixture, element, store } = setUp(spectatorFrames());
    expect(store.log().length).toBeGreaterThan(5);

    element.querySelector<HTMLButtonElement>('.log-tab')!.click();
    fixture.detectChanges();

    const modal = element.querySelector('app-game-log')!;
    expect(modal).toBeTruthy();
    expect(modal.querySelectorAll('ol li').length).toBe(store.log().length);

    expect(modal.textContent).toContain(store.log()[0].text);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('app-game-log')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    fixture.detectChanges();
    expect(element.querySelector('app-game-log')).toBeTruthy();
    element.querySelector<HTMLButtonElement>('app-game-log .close')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-game-log')).toBeNull();
  });

  it('opens a card, with where it is as well as what it is', () => {
    const { fixture, element, socket, store } = setUp(spectatorFrames());

    const found = store
      .snapshot()!
      .players.flatMap((seat) => seat.battlefield.map((permanent) => ({ seat, permanent })))
      .find(({ permanent }) => longestProse(permanent.card.rules).length > 10);
    expect(found, 'nothing on the board has any rules text').toBeTruthy();
    const { seat, permanent } = found!;

    socket.emit({
      type: 'chat',
      objectId: 'chat-1',
      messageType: 'GAME',
      text: `<font object_id='${permanent.card.objectId}'>${permanent.card.name}</font> attacks`,
    });
    fixture.detectChanges();
    expect(element.querySelector('app-card-inspector')).toBeNull();

    const openIt = () => {
      element.querySelector('app-event-feed .event')!.dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
    };
    openIt();

    const sheet = element.querySelector('app-card-inspector')!;
    expect(sheet).toBeTruthy();

    expect(sheet.querySelector('app-card-tile')).toBeTruthy();

    expect(sheet.textContent).toContain(longestProse(permanent.card.rules, permanent.card.name));
    for (const rules of sheet.querySelectorAll('.rules')) {
      expect(rules.textContent!).not.toContain('{');
    }

    expect(sheet.textContent).toContain('battlefield');
    expect(sheet.textContent).toContain(seat.name);
    expect(sheet.textContent).toContain(permanent.tapped ? 'tapped' : 'untapped');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('app-card-inspector')).toBeNull();

    openIt();
    element.querySelector<HTMLButtonElement>('app-card-inspector .close')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-card-inspector')).toBeNull();
  });

  it('says when it cannot draw, and keeps the game readable anyway', () => {
    const frames = spectatorFrames();
    const { text, element, fixture, store } = setUp(frames);

    expect(element.querySelector('canvas')).toBeNull();
    expect(text()).toContain('cannot draw the 3D board');

    expect(element.querySelectorAll('app-seat-hud').length).toBe(lastGame(frames).players.length);
    element.querySelector<HTMLButtonElement>('.log-tab')!.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('app-game-log ol li').length).toBe(store.log().length);
  });

  it('opens a zone as a list, and draws whichever card is pointed at in full', () => {
    const frames = spectatorFrames();

    let best = -1;
    let bestCount = 0;
    let seat = 0;
    frames.forEach((frame, index) => {
      if (frame.type !== 'gameState') return;
      frame.game.players.forEach((player, playerIndex) => {
        if (player.graveyard.length <= bestCount) return;
        bestCount = player.graveyard.length;
        best = index;
        seat = playerIndex;
      });
    });
    expect(bestCount, 'no graveyard in the capture holds more than one card').toBeGreaterThan(1);

    const { fixture, element } = setUp(frames.slice(0, best + 1));
    const game = (frames[best] as { game: GameStateView }).game;
    const graveyard = game.players[seat].graveyard;

    const hud = element.querySelectorAll('app-seat-hud')[seat];
    hud.querySelector<HTMLButtonElement>('button[title$="graveyard"]')!.click();
    fixture.detectChanges();

    const browser = element.querySelector('app-zone-browser')!;
    expect(browser).toBeTruthy();
    expect(browser.textContent).toContain(game.players[seat].name);

    const rows = [...browser.querySelectorAll('.row')];
    expect(rows.length).toBe(graveyard.length);
    expect(rows[0].textContent).toContain(graveyard.at(-1)!.name);
    expect(rows.at(-1)!.textContent).toContain(graveyard[0].name);

    const preview = () => browser.querySelector('.preview app-card-tile')?.textContent ?? '';
    expect(preview()).toContain(graveyard.at(-1)!.name);
    rows[1].dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(preview()).toContain(graveyard.at(-2)!.name);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('app-zone-browser')).toBeNull();
  });

  it('says an empty zone is empty instead of showing an empty list', () => {
    const { fixture, element, store } = setUp(spectatorFrames());

    expect(store.snapshot()!.players.every((player) => player.exile.length === 0)).toBe(true);

    element.querySelector<HTMLButtonElement>('app-seat-hud button[title$="exile"]')!.click();
    fixture.detectChanges();

    const browser = element.querySelector('app-zone-browser')!;
    expect(browser.textContent).toContain('Nothing in here yet');
    expect(browser.querySelectorAll('.row').length).toBe(0);
  });

  it('closes the zone browser once a click inside it activates a card, but not once it merely targets one', () => {
    const frames = loadFixture(FIXTURES.playerVsAi).map((line) => line.frame);
    const { socket, fixture, element } = setUp(frames);
    const game = lastGame(frames);
    const me = game.players.find((player) => player.isMe)!;
    const buried = {
      objectId: 'buried-1',
      name: 'Buried Creature',
      setCode: 'MH2',
      cardNumber: '1',
      rules: [],
      colors: [],
      icons: [],
      faceDown: false,
      isToken: false,
      counters: [],
      targets: [],
    };

    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_SELECT',
        message: 'Play spells and abilities',
        required: false,
        cards: [],
        cards2: [],
        selectableTargets: [],
        chosenTargets: [],
        choices: [],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['activate', 'passPriority'],
      },
      game: {
        ...game,
        players: game.players.map((player) =>
          player === me ? { ...player, graveyard: [...player.graveyard, buried] } : player,
        ),
        playable: [
          {
            objectId: buried.objectId,
            playableAbilityCount: 1,
            playableImportantCount: 1,
            abilityTexts: [],
            abilityIds: [],
          },
        ],
      },
    });
    fixture.detectChanges();

    element
      .querySelectorAll('app-seat-hud')[0]
      .querySelector<HTMLButtonElement>('button[title$="graveyard"]')!
      .click();
    fixture.detectChanges();

    const row = element.querySelector('app-zone-browser .row')!;
    (row as HTMLElement).click();
    fixture.detectChanges();

    expect(socket.lastSentOfType<{ objectId: string }>('activate')?.objectId).toBe(buried.objectId);
    expect(
      element.querySelector('app-zone-browser'),
      'a one-shot activate resolves the whole prompt',
    ).toBeNull();
  });

  it('says how many cards are in hand, and hides them on request', () => {
    const frames = loadFixture(FIXTURES.playerVsAi).map((line) => line.frame);
    const index = frames.findIndex((frame) => {
      const game = (frame as { game?: GameStateView }).game;
      return (game?.myHand.length ?? 0) > 2;
    });
    expect(index, 'no frame in the capture has a hand in it').toBeGreaterThan(-1);

    const { fixture, element, store } = setUp(frames.slice(0, index + 1));
    const tab = () => element.querySelector<HTMLButtonElement>('.hand-tab');
    expect(tab()?.textContent).toContain(String(store.snapshot()!.myHand.length));
    expect(element.querySelector('.stage')?.classList.contains('hand-closed')).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    fixture.detectChanges();
    expect(element.querySelector('.stage')?.classList.contains('hand-closed')).toBe(true);
    expect(tab()?.textContent).toContain(String(store.snapshot()!.myHand.length));

    tab()!.click();
    fixture.detectChanges();
    expect(element.querySelector('.stage')?.classList.contains('hand-closed')).toBe(false);
  });

  it('shows the cards only you can see, and plays one when the prompt allows it', () => {
    const frames = loadFixture(FIXTURES.playerVsAi).map((line) => line.frame);
    const { socket, fixture, element } = setUp(frames);
    expect(
      element.querySelector('app-card-windows[variant="private"]'),
      'no game has one of these',
    ).toBeNull();

    const game = lastGame(frames);
    const top = {
      objectId: 'citadel-top',
      name: 'Grim Tutor',
      setCode: 'MH2',
      cardNumber: '198',
      rules: [],
      colors: [],
      icons: [],
      faceDown: false,
      isToken: false,
      counters: [],
      targets: [],
    };
    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_SELECT',
        message: 'Play spells and abilities',
        required: false,
        cards: [],
        cards2: [],
        selectableTargets: [],
        chosenTargets: [],
        choices: [],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['activate', 'passPriority'],
      },
      game: {
        ...game,
        lookedAt: [{ name: 'Top card of your library', cards: [top] }],
        playable: [
          {
            objectId: top.objectId,
            playableAbilityCount: 1,
            playableImportantCount: 1,
            abilityTexts: [],
            abilityIds: [],
          },
        ],
      },
    });
    fixture.detectChanges();

    const panel = element.querySelector('app-card-windows[variant="private"]')!;
    expect(panel.textContent).toContain('Top card of your library');
    expect(panel.textContent).toContain('Grim Tutor');

    const card = panel.querySelector<HTMLButtonElement>('.card')!;
    expect(card.classList, 'the prompt can act on it, so it must say so').toContain('selectable');
    card.click();
    expect(socket.lastSentOfType<{ objectId: string }>('activate')?.objectId).toBe('citadel-top');
  });

  it('sends passPriority when space is pressed at a GAME_SELECT prompt, but not while typing', () => {
    const frames = loadFixture(FIXTURES.playerVsAi).map((line) => line.frame);
    const { socket, fixture, element } = setUp(frames);

    const game = lastGame(frames);
    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_SELECT',
        message: 'Play spells and abilities',
        required: false,
        cards: [],
        cards2: [],
        selectableTargets: [],
        chosenTargets: [],
        choices: [],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['activate', 'passPriority'],
      },

      game: {
        ...game,
        playable: [
          {
            objectId: 'hand-instant',
            playableAbilityCount: 1,
            playableImportantCount: 1,
            abilityTexts: [],
            abilityIds: [],
          },
        ],
      },
    });
    fixture.detectChanges();

    const input = document.createElement('input');
    element.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(
      socket.lastSentOfType('passPriority'),
      'typing a space must not pass priority',
    ).toBeUndefined();
    input.remove();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(socket.lastSentOfType('passPriority')).not.toBeUndefined();
  });

  it('offers no hand at all to a spectator', () => {
    const { element, store } = setUp(spectatorFrames());
    expect(store.snapshot()!.myHand).toEqual([]);
    expect(element.querySelector('.hand-tab')).toBeNull();
  });

  it('says which of "stopped", "reconnecting" and "finished" has happened', () => {
    const { socket, fixture, text } = setUp(spectatorFrames());

    socket.onclose?.();
    fixture.detectChanges();
    expect(text()).toContain('Reconnecting');

    socket.open();
    socket.emit({ type: 'disconnected', askToReconnect: true, keepSessionActive: false });
    fixture.detectChanges();
    expect(text()).toContain('game session was dropped');
  });

  it('shows the result of a finished game, and gets out of the way when asked', () => {
    const { text, element, fixture } = setUp([
      ...spectatorFrames(),
      { type: 'gameOver', gameId: 'g1', text: 'alicexyz has won the game' },
      {
        type: 'matchOver',
        gameId: 'g1',
        matchInfo: 'Match: 1 of 1 games finished',
        wins: 1,
        losses: 0,
        winsNeeded: 1,
      },
    ]);
    expect(text()).toContain('Game over');
    expect(text()).toContain('alicexyz has won the game');
    expect(text()).toContain('1 of 1 games finished');

    expect(text()).toContain('turn ');

    element.querySelector<HTMLButtonElement>('.result .dismiss')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.result')).toBeNull();
    expect(text()).toContain('turn ');
  });

  describe('the event feed', () => {
    function gameLine(text: string): ServerFrame {
      return { type: 'chat', objectId: 'chat-1', messageType: 'GAME', text };
    }

    const chips = (element: HTMLElement) => [...element.querySelectorAll('app-event-feed .event')];

    it('keeps the last few of a burst rather than all of it', () => {
      const { element, store } = setUp(spectatorFrames());
      const events = store.events();
      expect(events.length).toBeGreaterThan(10);

      const shown = chips(element);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.length).toBeLessThanOrEqual(EVENT_FEED_MAX);

      expect(shown[0].textContent).toContain(events.at(-1)!.text);
    });

    it('puts the engine’s own sentence on screen the moment it arrives', () => {
      const { socket, element, fixture } = setUp(spectatorFrames());

      socket.emit(
        gameLine("<font color='#B0C4DE'>Grave Titan [a2a]</font> was destroyed by Doom Blade"),
      );
      fixture.detectChanges();

      const chip = chips(element)[0];
      expect(chip).toBeTruthy();

      expect(chip.textContent).toContain('Grave Titan was destroyed by Doom Blade');
      expect(chip.getAttribute('data-kind')).toBe('removal');
    });

    it('opens the card a chip names, when the card is still on the table', () => {
      const { socket, element, fixture, store } = setUp(spectatorFrames());
      const permanent = store.snapshot()!.players.flatMap((player) => player.battlefield)[0];
      expect(permanent, 'the capture ends with an empty board').toBeTruthy();

      socket.emit(
        gameLine(
          `<font object_id='${permanent.card.objectId}'>${permanent.card.name}</font> was destroyed by Doom Blade`,
        ),
      );
      fixture.detectChanges();
      expect(element.querySelector('app-card-inspector')).toBeNull();

      chips(element)[0].dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();

      const sheet = element.querySelector('app-card-inspector')!;
      expect(sheet).toBeTruthy();
      expect(sheet.textContent).toContain(permanent.card.name);
    });

    it('falls back to the log for an event with no card left to show', () => {
      const { socket, element, fixture } = setUp(spectatorFrames());

      socket.emit(gameLine('bobms0n7xn3 loses 2 life at combat from Crypt Ghast [f3a]'));
      fixture.detectChanges();
      expect(element.querySelector('app-game-log')).toBeNull();

      chips(element)[0].dispatchEvent(new MouseEvent('click'));
      fixture.detectChanges();
      expect(element.querySelector('app-game-log')).toBeTruthy();
    });

    it('gets out of the way of the log, which is the same thing at length', () => {
      const { socket, element, fixture } = setUp(spectatorFrames());
      socket.emit(gameLine('Grave Titan [a2a] was destroyed by Doom Blade'));
      fixture.detectChanges();
      expect(chips(element).length).toBeGreaterThan(0);

      element.querySelector<HTMLButtonElement>('.log-tab')!.click();
      fixture.detectChanges();
      expect(element.querySelector('app-event-feed')).toBeNull();
    });
  });

  it('flashes how much life a seat just lost, then takes it back down', () => {
    vi.useFakeTimers();
    try {
      const frames = spectatorFrames();
      const { socket, element, fixture } = setUp(frames);
      const delta = () => element.querySelector('app-seat-hud .delta')?.textContent?.trim() ?? null;

      vi.advanceTimersByTime(LIFE_FLASH_MS);
      fixture.detectChanges();
      expect(delta()).toBeNull();

      const last = frames.filter((frame) => 'game' in frame && frame.game).at(-1) as {
        game: GameStateView;
      };
      const hit = last.game.players[0];
      socket.emit({
        type: 'gameState',
        gameId: 'g1',
        game: {
          ...last.game,
          players: last.game.players.map((player) =>
            player.playerId === hit.playerId ? { ...player, life: player.life - 3 } : player,
          ),
        },
      });
      fixture.detectChanges();

      expect(delta()).toBe('−3');

      vi.advanceTimersByTime(LIFE_FLASH_MS + 1);
      fixture.detectChanges();
      expect(delta()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns loudly when the bridge could not translate something', () => {
    const { text } = setUp([
      ...spectatorFrames(),
      {
        type: 'unmapped',
        callbackMethod: 'START_DRAFT',
        payloadClass: 'mage.view.DraftClientMessage',
      },
    ]);
    expect(text()).toContain('could not translate');
    expect(text()).toContain('START_DRAFT');
  });
});
