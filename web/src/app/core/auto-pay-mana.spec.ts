import { GameStateView, PermanentStateView } from './protocol';
import { FakeSocket } from '../testing/fake-socket';
import { seatAsPlayer, setUp } from './testing-support';

describe('auto-paying a mana cost', () => {
  function land(objectId: string, name: string): PermanentStateView {
    return {
      card: {
        objectId,
        name,
        typeLine: `Basic Land  - ${name}`,
        rules: ['{T}: Add {B}.'],
        colors: [],
        icons: [],
        faceDown: false,
        isToken: false,
        counters: [],
        targets: [],
      },
      tapped: false,
      flipped: false,
      phasedIn: true,
      isCopy: false,
      damage: 0,
      attachments: [],
      canAttack: false,
      canBlock: false,
    };
  }

  function boardOf(swamps: PermanentStateView[]): GameStateView {
    return {
      turn: 3,
      isPlayer: true,
      specialActionAvailable: false,
      myPlayerId: 'p1',
      myHand: [],
      stack: [],
      combat: [],
      playable: swamps
        .filter((one) => !one.tapped)
        .map((one) => ({
          objectId: one.card.objectId,
          playableAbilityCount: 1,
          playableImportantCount: 0,
          abilityTexts: ['{T}: Add {B}.'],
          abilityIds: [],
        })),
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
          handCount: 1,
          wins: 0,
          winsNeeded: 1,
          manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
          battlefield: swamps,
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
  }

  function emitManaPrompt(socket: FakeSocket, cost: string, game: GameStateView): void {
    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_PLAY_MANA',

        message: `Pay ${cost}<div style='font-size:11pt'>Vampire Hexmage</div>`,
        required: false,
        cards: [],
        cards2: [],
        selectableTargets: [],
        chosenTargets: [],
        choices: [],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['activate', 'cancel', 'payManaFromPool', 'special'],
      },
      game,
    });
  }

  function activations(socket: FakeSocket): string[] {
    return socket
      .sentFrames<{ type: string; objectId?: string }>()
      .filter((frame) => frame.type === 'activate')
      .map((frame) => frame.objectId ?? '');
  }

  it('taps a source per mana, one prompt at a time, and stops when the cost is paid', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    const swamps = [land('l1', 'Swamp'), land('l2', 'Swamp')];

    emitManaPrompt(socket, '{B}{B}', boardOf(swamps));
    store.autoPayMana();
    expect(activations(socket)).toEqual(['l1']);
    expect(store.autoPaying()).toBe(true);

    emitManaPrompt(socket, '{B}', boardOf([{ ...swamps[0], tapped: true }, swamps[1]]));
    expect(activations(socket)).toEqual(['l1', 'l2']);

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
      game: boardOf(swamps.map((one) => ({ ...one, tapped: true }))),
    });
    expect(store.autoPaying()).toBe(false);
    expect(activations(socket)).toEqual(['l1', 'l2']);
  });

  it('gives up rather than repeating a step that did not change the outstanding cost', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    const swamps = [land('l1', 'Swamp')];

    emitManaPrompt(socket, '{B}', boardOf(swamps));
    store.autoPayMana();
    expect(activations(socket)).toEqual(['l1']);

    emitManaPrompt(socket, '{B}', boardOf(swamps));
    expect(activations(socket)).toEqual(['l1']);
    expect(store.autoPaying()).toBe(false);

    expect(store.toasts().at(-1)?.text).toContain('auto-pay');
  });

  it('answers "Pick a mana color" with the colour the plan meant that source to make', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);

    const towers = [land('t1', 'Command Tower'), land('t2', 'Command Tower')];
    for (const tower of towers) {
      tower.card.rules = ["{T}: Add one mana of any color in your commander's color identity."];
    }
    const game = boardOf(towers);
    for (const entry of game.playable) entry.abilityTexts = towers[0].card.rules;

    game.players[0].commandZone = [
      {
        objectId: 'cmdr',
        name: 'A Commander',
        rules: [],
        card: {
          objectId: 'cmdr',
          name: 'A Commander',
          rules: [],
          colors: ['W', 'B'],
          icons: [],
          faceDown: false,
          isToken: false,
          counters: [],
          targets: [],
        },
      },
    ];

    emitManaPrompt(socket, '{W}{B}', game);
    store.autoPayMana();
    expect(activations(socket)).toEqual(['t1']);

    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_CHOOSE_CHOICE',
        message: 'Pick a mana color',
        required: false,
        cards: [],
        cards2: [],
        selectableTargets: [],
        chosenTargets: [],
        choices: [
          { key: 'White', label: 'White' },
          { key: 'Black', label: 'Black' },
        ],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['chooseValue'],
      },
    });

    expect(socket.lastSentOfType<{ value: string }>('chooseValue')?.value).toBe('White');
    expect(store.autoPaying()).toBe(true);
  });

  it('hands back a mid-payment choice that is not the colour picker', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    emitManaPrompt(socket, '{B}', boardOf([land('l1', 'Swamp')]));
    store.autoPayMana();

    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_CHOOSE_CHOICE',
        message: 'Choose a card type',
        required: false,
        cards: [],
        cards2: [],
        selectableTargets: [],
        chosenTargets: [],
        choices: [
          { key: 'creature', label: 'Creature' },
          { key: 'land', label: 'Land' },
        ],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['chooseValue'],
      },
    });

    expect(socket.lastSentOfType('chooseValue')).toBeUndefined();
    expect(store.autoPaying()).toBe(false);
    expect(store.decision()?.kind).toBe('GAME_CHOOSE_CHOICE');
  });

  it('answers the ability picker a tapped source can raise, and carries on', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    const swamps = [land('l1', 'Swamp')];

    emitManaPrompt(socket, '{B}', boardOf(swamps));
    store.autoPayMana();

    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_CHOOSE_ABILITY',
        required: false,
        cards: [],
        cards2: [],
        selectableTargets: [],
        chosenTargets: [],
        choices: [
          { key: 'a1', label: '1. {T}: Add {B}.' },
          {
            key: 'a2',
            label: '2. {2}, {T}: Add {B} for each black creature card in your graveyard.',
          },
        ],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['cancel', 'chooseAbility'],
      },
    });

    expect(socket.lastSentOfType<{ abilityId: string }>('chooseAbility')?.abilityId).toBe('a1');
    expect(store.autoPaying()).toBe(true);
  });

  it('does nothing when there is no mana prompt to pay', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    store.autoPayMana();
    expect(store.autoPaying()).toBe(false);
    expect(socket.lastSentOfType('activate')).toBeUndefined();
  });

  it('lets go when the game ends mid-payment', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    emitManaPrompt(socket, '{B}', boardOf([land('l1', 'Swamp')]));
    store.autoPayMana();

    socket.emit({ type: 'gameOver', gameId: 'g1', text: 'me has won the game' });
    expect(store.autoPaying()).toBe(false);
  });
});
