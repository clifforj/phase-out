import { AUTO_PASS_GLANCE_MS, AUTO_PASS_UNCHANGED_MS } from './game-store';
import { CardView, GameStateView, PlayableObjectView } from './protocol';
import { FakeSocket } from '../testing/fake-socket';
import { seatAsPlayer, setUp } from './testing-support';

describe('auto-pass for administrative priority windows', () => {
  function card(objectId: string, name: string): CardView {
    return {
      objectId,
      name,
      rules: [],
      colors: [],
      icons: [],
      faceDown: false,
      isToken: false,
      counters: [],
      targets: [],
    };
  }

  const battlefieldCard = card('swamp-1', 'Swamp');
  const handCard = card('bolt-1', 'Lightning Bolt');

  const baseGame: GameStateView = {
    turn: 1,
    isPlayer: true,
    specialActionAvailable: false,
    myPlayerId: 'p1',
    myHand: [],
    stack: [],
    combat: [],
    playable: [],
    players: [
      {
        playerId: 'p1',
        name: 'me',
        life: 40,
        isMe: true,
        isHuman: true,
        isActive: true,
        hasPriority: true,
        hasLeft: false,
        libraryCount: 90,
        handCount: 0,
        wins: 0,
        winsNeeded: 1,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        battlefield: [
          {
            card: battlefieldCard,
            tapped: false,
            flipped: false,
            phasedIn: true,
            isCopy: false,
            damage: 0,
            attachments: [],
            canAttack: false,
            canBlock: false,
          },
        ],
        graveyard: [],
        exile: [],
        commandZone: [],
        counters: [],
        designations: [],
        monarch: false,
        initiative: false,
      },
    ],
  };

  const manaAbility: PlayableObjectView = {
    objectId: battlefieldCard.objectId,
    playableAbilityCount: 1,
    playableImportantCount: 0,
    abilityTexts: ['{T}: Add {B}.'],
    abilityIds: [],
  };

  function emitPriorityPrompt(socket: FakeSocket, game: GameStateView): void {
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
      game,
    });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-passes a window with nothing but a bare mana ability, near-instantly when the stack is unchanged', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

    emitPriorityPrompt(socket, { ...baseGame, playable: [manaAbility] });
    expect(socket.lastSentOfType('passPriority')).toBeUndefined();

    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);
    expect(socket.lastSentOfType('passPriority')).toBeTruthy();
  });

  it('holds for the longer glance delay when the stack changed since the previous prompt', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();
    const passCount = () =>
      socket.sentFrames<{ type: string }>().filter((f) => f.type === 'passPriority').length;

    emitPriorityPrompt(socket, { ...baseGame, playable: [] });
    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);
    expect(passCount()).toBe(1);

    emitPriorityPrompt(socket, {
      ...baseGame,
      stack: [card('spell-1', 'Opponent Spell')],
      playable: [manaAbility],
    });

    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);
    expect(passCount()).toBe(1);

    vi.advanceTimersByTime(AUTO_PASS_GLANCE_MS - AUTO_PASS_UNCHANGED_MS);
    expect(passCount()).toBe(2);
  });

  it('holds for the glance delay after something consequential was logged, with the stack untouched', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();
    const passCount = () =>
      socket.sentFrames<{ type: string }>().filter((f) => f.type === 'passPriority').length;

    emitPriorityPrompt(socket, { ...baseGame, playable: [] });
    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);
    expect(passCount()).toBe(1);

    socket.emit({
      type: 'chat',
      objectId: 'chat-1',
      messageType: 'GAME',
      text: "<font color='#B0C4DE' object_id='c1'>Grave Titan [a2a]</font> was destroyed by Doom Blade",
    });
    emitPriorityPrompt(socket, { ...baseGame, playable: [manaAbility] });

    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);
    expect(passCount()).toBe(1);
    vi.advanceTimersByTime(AUTO_PASS_GLANCE_MS - AUTO_PASS_UNCHANGED_MS);
    expect(passCount()).toBe(2);

    emitPriorityPrompt(socket, { ...baseGame, playable: [manaAbility] });
    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);
    expect(passCount()).toBe(3);
  });

  it('does not hold for an ordinary cast or a land drop', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

    emitPriorityPrompt(socket, { ...baseGame, playable: [] });
    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);

    for (const text of [
      'me plays Swamp [3ae]',
      'me casts Grave Titan [a2a] from hand',
      'me puts Grave Titan [a2a] from stack onto the Battlefield',
    ]) {
      socket.emit({ type: 'chat', objectId: 'chat-1', messageType: 'GAME', text });
    }
    emitPriorityPrompt(socket, { ...baseGame, playable: [manaAbility] });

    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);
    expect(
      socket.sentFrames<{ type: string }>().filter((f) => f.type === 'passPriority'),
    ).toHaveLength(2);
  });

  it('never auto-passes when a hand card is castable, even though playableImportantCount is 0', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

    const castableBolt: PlayableObjectView = {
      objectId: handCard.objectId,
      playableAbilityCount: 1,
      playableImportantCount: 0,
      abilityTexts: ['Lightning Bolt'],
      abilityIds: [],
    };
    emitPriorityPrompt(socket, {
      ...baseGame,
      myHand: [handCard],
      playable: [manaAbility, castableBolt],
    });

    vi.advanceTimersByTime(AUTO_PASS_GLANCE_MS * 2);
    expect(socket.lastSentOfType('passPriority')).toBeUndefined();
  });

  it("never auto-passes a planeswalker's abilities, even though XMage reports playableImportantCount 0 for them", () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

    const planeswalker: CardView = {
      ...card('obnix-1', 'Ob Nixilis of the Black Oath'),
      typeLine: 'Legendary Planeswalker — Nixilis',
    };
    const loyaltyAbilities: PlayableObjectView = {
      objectId: planeswalker.objectId,
      playableAbilityCount: 2,
      playableImportantCount: 0,
      abilityTexts: [
        '+2: Each opponent loses 1 life. You gain life equ...',
        '-2: Create a 5/5 black Demon creature token with ...',
      ],
      abilityIds: [],
    };
    const game: GameStateView = {
      ...baseGame,
      players: [
        {
          ...baseGame.players[0],
          battlefield: [
            ...baseGame.players[0].battlefield,
            { ...baseGame.players[0].battlefield[0], card: planeswalker },
          ],
        },
      ],
      playable: [loyaltyAbilities],
    };
    emitPriorityPrompt(socket, game);

    vi.advanceTimersByTime(AUTO_PASS_GLANCE_MS * 2);
    expect(socket.lastSentOfType('passPriority')).toBeUndefined();
  });

  it('never auto-passes at declare-attackers/-blockers, even with nothing playable', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

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
        possibleAttackers: [battlefieldCard.objectId],
        possibleBlockers: [],
        expects: ['activate', 'passPriority', 'special'],
      },
      game: { ...baseGame, playable: [] },
    });

    vi.advanceTimersByTime(AUTO_PASS_GLANCE_MS * 2);
    expect(socket.lastSentOfType('passPriority')).toBeUndefined();
  });

  it('keeps `decision` empty for a window that is going to answer itself', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

    emitPriorityPrompt(socket, { ...baseGame, playable: [manaAbility] });
    expect(store.prompt()).not.toBeNull();
    expect(store.decision()).toBeNull();
    expect(store.needsAction()).toBe(false);
    expect(store.autoPassing()).toBe(true);
    expect(store.autoPassMs()).toBe(AUTO_PASS_UNCHANGED_MS);

    vi.advanceTimersByTime(AUTO_PASS_UNCHANGED_MS);
    expect(store.decision()).toBeNull();
    expect(store.autoPassing()).toBe(false);
    expect(store.prompt()).toBeNull();
  });

  it('surfaces a real decision immediately, with no settling delay of its own', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

    const castableBolt: PlayableObjectView = {
      objectId: handCard.objectId,
      playableAbilityCount: 1,
      playableImportantCount: 0,
      abilityTexts: ['Lightning Bolt'],
      abilityIds: [],
    };
    emitPriorityPrompt(socket, { ...baseGame, myHand: [handCard], playable: [castableBolt] });

    expect(store.decision()).toBe(store.prompt());
    expect(store.needsAction()).toBe(true);
    expect(store.autoPassing()).toBe(false);
  });

  it('gives back the window it was holding when the player interrupts the auto-pass', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

    emitPriorityPrompt(socket, {
      ...baseGame,
      stack: [card('spell-1', 'Opponent Spell')],
      playable: [manaAbility],
    });
    expect(store.decision()).toBeNull();

    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_ASK',
        required: false,
        cards: [],
        cards2: [],
        selectableTargets: [],
        chosenTargets: [],
        choices: [],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['answer'],
        message: 'Pay {1}?',
      },
      game: { ...baseGame, playable: [] },
    });

    expect(store.autoPassing()).toBe(false);
    expect(store.decision()?.kind).toBe('GAME_ASK');
    vi.advanceTimersByTime(AUTO_PASS_GLANCE_MS * 2);
    expect(socket.lastSentOfType('passPriority')).toBeUndefined();
  });

  it('cancels a pending auto-pass the moment the player acts on the same prompt', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    vi.useFakeTimers();

    emitPriorityPrompt(socket, { ...baseGame, playable: [manaAbility] });
    store.activate(battlefieldCard.objectId);
    expect(socket.lastSentOfType('activate')).toBeTruthy();

    vi.advanceTimersByTime(AUTO_PASS_GLANCE_MS * 2);
    expect(socket.lastSentOfType('passPriority')).toBeUndefined();
  });
});
