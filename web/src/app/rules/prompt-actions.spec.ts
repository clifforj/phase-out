import type {
  CardView,
  CombatGroupStateView,
  GameStateView,
  PermanentStateView,
  PlayerStateView,
  PromptView,
} from '../core/protocol';
import type { SeatRef } from './zones';
import {
  actionableIds,
  boardTargetCards,
  boardTargets,
  cardChoicePrompt,
  chosenIds,
  clickActionType,
  declaredCombatants,
  hasBoardReachableTarget,
  promptContext,
  zoneTargetCount,
  zoneTargetsFor,
} from './prompt-actions';

function prompt(overrides: Partial<PromptView> = {}): PromptView {
  return {
    kind: 'NONE',
    required: false,
    cards: [],
    cards2: [],
    selectableTargets: [],
    chosenTargets: [],
    choices: [],
    amounts: [],
    possibleAttackers: [],
    possibleBlockers: [],
    expects: [],
    ...overrides,
  };
}

function card(objectId: string): CardView {
  return {
    objectId,
    name: objectId,
    rules: [],
    colors: [],
    icons: [],
    faceDown: false,
    isToken: false,
    counters: [],
    targets: [],
  };
}

function seat(index: number, overrides: Partial<PlayerStateView> = {}): SeatRef {
  const player: PlayerStateView = {
    playerId: `p${index}`,
    name: `Player ${index}`,
    life: 40,
    isMe: false,
    isHuman: true,
    isActive: false,
    hasPriority: false,
    hasLeft: false,
    libraryCount: 0,
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
    ...overrides,
  };
  return { index, player };
}

function permanent(objectId: string, typeLine: string): PermanentStateView {
  return {
    card: { ...card(objectId), typeLine },
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

function gameWith(players: PlayerStateView[], combat: CombatGroupStateView[] = []): GameStateView {
  return {
    turn: 1,
    isPlayer: true,
    specialActionAvailable: false,
    players,
    myHand: [],
    stack: [],
    combat,
    playable: [],
  };
}

describe('promptContext', () => {
  it('is "other" when there is no prompt, or the prompt is not GAME_SELECT', () => {
    expect(promptContext(null)).toBe('other');
    expect(promptContext(prompt({ kind: 'GAME_TARGET' }))).toBe('other');
  });

  it('is priority for an ordinary GAME_SELECT', () => {
    expect(promptContext(prompt({ kind: 'GAME_SELECT' }))).toBe('priority');
  });

  it('reads the combat step off combatStep, not the message', () => {
    expect(
      promptContext(
        prompt({ kind: 'GAME_SELECT', message: 'anything', combatStep: 'DECLARE_ATTACKERS' }),
      ),
    ).toBe('declare-attackers');
    expect(
      promptContext(
        prompt({
          kind: 'GAME_SELECT',
          message: 'Select attackers',
          combatStep: 'DECLARE_BLOCKERS',
        }),
      ),
    ).toBe('declare-blockers');
  });

  it('is still the attack step when every eligible attacker has already been declared', () => {
    expect(
      promptContext(
        prompt({ kind: 'GAME_SELECT', combatStep: 'DECLARE_ATTACKERS', possibleAttackers: [] }),
      ),
    ).toBe('declare-attackers');
  });

  it('falls back to possibleAttackers/possibleBlockers when combatStep is absent', () => {
    expect(
      promptContext(
        prompt({ kind: 'GAME_SELECT', message: 'Select attackers', possibleAttackers: ['a'] }),
      ),
    ).toBe('declare-attackers');
    expect(
      promptContext(prompt({ kind: 'GAME_SELECT', message: 'anything', possibleBlockers: ['b'] })),
    ).toBe('declare-blockers');
  });

  it('prefers attackers when somehow both are present', () => {
    expect(
      promptContext(
        prompt({ kind: 'GAME_SELECT', possibleAttackers: ['a'], possibleBlockers: ['b'] }),
      ),
    ).toBe('declare-attackers');
  });
});

describe('declaredCombatants', () => {
  const bear = permanent('bear', 'Creature - Bear');
  const wolf = permanent('wolf', 'Creature - Wolf');
  const ogre = permanent('ogre', 'Creature - Ogre');

  it('is empty outside a combat step, and with no snapshot', () => {
    const game = gameWith(
      [seat(0, { isMe: true, battlefield: [bear] }).player],
      [{ blocked: false, defenderName: 'Player 1', attackers: [card('bear')], blockers: [] }],
    );
    expect(declaredCombatants('priority', game)).toEqual([]);
    expect(declaredCombatants('other', game)).toEqual([]);
    expect(declaredCombatants('declare-attackers', null)).toEqual([]);
  });

  it('names each of my attackers and what it is attacking', () => {
    const game = gameWith(
      [seat(0, { isMe: true, battlefield: [bear, wolf, ogre] }).player, seat(1).player],
      [
        {
          blocked: false,
          defenderName: 'Player 1',
          attackers: [card('bear'), card('wolf')],
          blockers: [],
        },
        { blocked: false, defenderName: 'Ob Nixilis', attackers: [card('ogre')], blockers: [] },
      ],
    );
    expect(declaredCombatants('declare-attackers', game)).toEqual([
      { id: 'bear', label: 'bear', against: 'Player 1' },
      { id: 'wolf', label: 'wolf', against: 'Player 1' },
      { id: 'ogre', label: 'ogre', against: 'Ob Nixilis' },
    ]);
  });

  it('names only my own blockers, against the attackers they are blocking', () => {
    const game = gameWith(
      [
        seat(0, { battlefield: [bear, wolf] }).player,
        seat(1, { isMe: true, battlefield: [ogre] }).player,
      ],
      [
        {
          blocked: true,
          defenderName: 'Player 1',
          attackers: [card('bear'), card('wolf')],
          blockers: [card('ogre')],
        },
      ],
    );
    expect(declaredCombatants('declare-blockers', game)).toEqual([
      { id: 'ogre', label: 'ogre', against: 'bear and wolf' },
    ]);
  });
});

describe('actionableIds', () => {
  it('is empty with no prompt', () => {
    expect(actionableIds(null, new Set(['x']))).toEqual(new Set());
  });

  it("at GAME_SELECT, is XMage's playable set plus any declarable attackers/blockers", () => {
    const p = prompt({ kind: 'GAME_SELECT', possibleAttackers: ['creature-1'] });
    expect(actionableIds(p, new Set(['land-1']))).toEqual(new Set(['land-1', 'creature-1']));
  });

  it('at a combat step, also offers the creatures already declared — the undeclare click', () => {
    const p = prompt({
      kind: 'GAME_SELECT',
      combatStep: 'DECLARE_ATTACKERS',
      possibleAttackers: ['wolf'],
    });
    const game = gameWith(
      [
        seat(0, {
          isMe: true,
          battlefield: [permanent('bear', 'Creature - Bear'), permanent('wolf', 'Creature - Wolf')],
        }).player,
      ],
      [{ blocked: false, defenderName: 'Player 1', attackers: [card('bear')], blockers: [] }],
    );
    expect(actionableIds(p, new Set(), game)).toEqual(new Set(['wolf', 'bear']));

    expect(actionableIds(p, new Set())).toEqual(new Set(['wolf']));
  });

  it('at an ordinary priority window, ignores a combat still standing in the snapshot', () => {
    const p = prompt({ kind: 'GAME_SELECT', combatStep: undefined });
    const game = gameWith(
      [seat(0, { isMe: true, battlefield: [permanent('bear', 'Creature - Bear')] }).player],
      [{ blocked: false, defenderName: 'Player 1', attackers: [card('bear')], blockers: [] }],
    );
    expect(actionableIds(p, new Set(['land-1']), game)).toEqual(new Set(['land-1']));
  });

  it('at GAME_PLAY_MANA, is the playable set (there is no selectable set for mana)', () => {
    const p = prompt({ kind: 'GAME_PLAY_MANA' });
    expect(actionableIds(p, new Set(['land-1', 'land-2']))).toEqual(new Set(['land-1', 'land-2']));
  });

  it('at GAME_TARGET, is selectableTargets — not the playable set, which is irrelevant there', () => {
    const p = prompt({ kind: 'GAME_TARGET', selectableTargets: ['creature-2'] });
    expect(actionableIds(p, new Set(['land-1']))).toEqual(new Set(['creature-2']));
  });

  it('is empty for prompt kinds with no board-click action', () => {
    for (const kind of [
      'GAME_ASK',
      'GAME_CHOOSE_ABILITY',
      'GAME_CHOOSE_PILE',
      'GAME_CHOOSE_CHOICE',
      'GAME_PLAY_XMANA',
      'GAME_GET_AMOUNT',
      'GAME_GET_MULTI_AMOUNT',
    ] as const) {
      expect(actionableIds(prompt({ kind, selectableTargets: ['x'] }), new Set(['y']))).toEqual(
        new Set(),
      );
    }
  });
});

describe('chosenIds', () => {
  it('is empty outside GAME_TARGET', () => {
    expect(chosenIds(prompt({ kind: 'GAME_SELECT' }))).toEqual(new Set());
    expect(chosenIds(null)).toEqual(new Set());
  });

  it('is chosenTargets at GAME_TARGET, distinct from selectableTargets', () => {
    const p = prompt({ kind: 'GAME_TARGET', selectableTargets: ['a', 'b'], chosenTargets: ['a'] });
    expect(chosenIds(p)).toEqual(new Set(['a']));
    expect(actionableIds(p, new Set())).toEqual(new Set(['a', 'b']));
  });
});

describe('clickActionType', () => {
  it('is chooseTarget at GAME_TARGET', () => {
    expect(clickActionType(prompt({ kind: 'GAME_TARGET' }))).toBe('chooseTarget');
  });

  it('is activate at GAME_SELECT and GAME_PLAY_MANA', () => {
    expect(clickActionType(prompt({ kind: 'GAME_SELECT' }))).toBe('activate');
    expect(clickActionType(prompt({ kind: 'GAME_PLAY_MANA' }))).toBe('activate');
  });

  it('is null with no prompt or a button-only prompt kind', () => {
    expect(clickActionType(null)).toBeNull();
    expect(clickActionType(prompt({ kind: 'GAME_ASK' }))).toBeNull();
  });
});

describe('zoneTargetsFor', () => {
  it('is empty with no prompt, outside GAME_TARGET, or with no selectable targets', () => {
    const seats = [seat(0, { graveyard: [card('g1')] })];
    expect(zoneTargetsFor(null, seats)).toEqual([]);
    expect(
      zoneTargetsFor(prompt({ kind: 'GAME_SELECT', selectableTargets: ['g1'] }), seats),
    ).toEqual([]);
    expect(zoneTargetsFor(prompt({ kind: 'GAME_TARGET' }), seats)).toEqual([]);
  });

  it('finds the graveyard a selectable target is buried in, board pile depth or not', () => {
    const seats = [seat(0, { graveyard: [card('g1'), card('g2'), card('g3')] })];
    const p = prompt({ kind: 'GAME_TARGET', selectableTargets: ['g1'] });
    expect(zoneTargetsFor(p, seats)).toEqual([{ seat: 0, kind: 'graveyard', targets: ['g1'] }]);
  });

  it('is empty when the only selectable targets are on the battlefield, not in a zone it browses', () => {
    const seats = [seat(0, { graveyard: [card('g1')] })];
    const p = prompt({ kind: 'GAME_TARGET', selectableTargets: ['creature-1'] });
    expect(zoneTargetsFor(p, seats)).toEqual([]);
  });

  it('reports one group per seat/kind, each carrying only its own targets', () => {
    const seats = [
      seat(0, { graveyard: [card('g1'), card('g2')], exile: [card('e1')] }),
      seat(1, { graveyard: [card('g3')] }),
    ];
    const p = prompt({ kind: 'GAME_TARGET', selectableTargets: ['g1', 'g2', 'e1', 'g3'] });
    expect(zoneTargetsFor(p, seats)).toEqual([
      { seat: 0, kind: 'graveyard', targets: ['g1', 'g2'] },
      { seat: 0, kind: 'exile', targets: ['e1'] },
      { seat: 1, kind: 'graveyard', targets: ['g3'] },
    ]);
  });
});

describe('hasBoardReachableTarget', () => {
  it('is false with no prompt, outside GAME_TARGET, with no targets, or with no snapshot', () => {
    const game = gameWith([{ ...seat(0).player, battlefield: [permanent('c1', 'Creature')] }]);
    expect(hasBoardReachableTarget(null, game)).toBe(false);
    expect(
      hasBoardReachableTarget(prompt({ kind: 'GAME_SELECT', selectableTargets: ['c1'] }), game),
    ).toBe(false);
    expect(hasBoardReachableTarget(prompt({ kind: 'GAME_TARGET' }), game)).toBe(false);
    expect(
      hasBoardReachableTarget(prompt({ kind: 'GAME_TARGET', selectableTargets: ['c1'] }), null),
    ).toBe(false);
  });

  it('is false when every legal target is buried in a graveyard or an exile pile', () => {
    const game = gameWith([{ ...seat(0).player, graveyard: [card('g1')], exile: [card('e1')] }]);
    expect(
      hasBoardReachableTarget(
        prompt({ kind: 'GAME_TARGET', selectableTargets: ['g1', 'e1'] }),
        game,
      ),
    ).toBe(false);
  });

  it('finds a target on a battlefield, on the stack, in hand, or a player', () => {
    const battlefield = gameWith([
      { ...seat(0).player, battlefield: [permanent('c1', 'Creature')] },
    ]);
    const stack = { ...gameWith([seat(0).player]), stack: [card('s1')] };
    const hand = { ...gameWith([seat(0).player]), myHand: [card('h1')] };
    const players = gameWith([seat(0).player]);
    const targeting = (id: string) => prompt({ kind: 'GAME_TARGET', selectableTargets: [id] });
    expect(hasBoardReachableTarget(targeting('c1'), battlefield)).toBe(true);
    expect(hasBoardReachableTarget(targeting('s1'), stack)).toBe(true);
    expect(hasBoardReachableTarget(targeting('h1'), hand)).toBe(true);
    expect(hasBoardReachableTarget(targeting('p0'), players)).toBe(true);
  });

  it('is false for a selectable id that is nowhere in the snapshot at all', () => {
    const game = gameWith([seat(0).player]);
    expect(
      hasBoardReachableTarget(
        prompt({ kind: 'GAME_TARGET', selectableTargets: ['ability-1'] }),
        game,
      ),
    ).toBe(false);
  });

  it('is true for Endless Detour: a stack spell alongside graveyard cards', () => {
    const game = {
      ...gameWith([{ ...seat(0).player, graveyard: [card('g1')] }]),
      stack: [card('s1')],
    };
    const p = prompt({
      kind: 'GAME_TARGET',
      targetZone: 'GRAVEYARD',
      selectableTargets: ['g1', 's1'],
    });
    expect(hasBoardReachableTarget(p, game)).toBe(true);

    expect(zoneTargetsFor(p, [seat(0, { graveyard: [card('g1')] })])).toEqual([
      { seat: 0, kind: 'graveyard', targets: ['g1'] },
    ]);
  });
});

describe('zoneTargetCount', () => {
  it('counts the legal targets lying in every graveyard and exile pile, and nothing else', () => {
    const game = gameWith([
      {
        ...seat(0).player,
        graveyard: [card('g1'), card('g2')],
        battlefield: [permanent('c1', 'Creature')],
      },
      { ...seat(1).player, exile: [card('e1')] },
    ]);
    const p = prompt({ kind: 'GAME_TARGET', selectableTargets: ['g1', 'g2', 'e1', 'c1'] });
    expect(zoneTargetCount(p, game)).toBe(3);
  });

  it('is zero with no prompt, outside GAME_TARGET, or with no snapshot', () => {
    const game = gameWith([{ ...seat(0).player, graveyard: [card('g1')] }]);
    expect(zoneTargetCount(null, game)).toBe(0);
    expect(zoneTargetCount(prompt({ kind: 'GAME_SELECT', selectableTargets: ['g1'] }), game)).toBe(
      0,
    );
    expect(zoneTargetCount(prompt({ kind: 'GAME_TARGET', selectableTargets: ['g1'] }), null)).toBe(
      0,
    );
  });
});

describe('boardTargets', () => {
  it('is empty with no prompt, no snapshot, outside GAME_TARGET, or with nothing selectable', () => {
    const game = gameWith([seat(0).player]);
    expect(boardTargets(null, game)).toEqual([]);
    expect(boardTargets(prompt({ kind: 'GAME_TARGET', selectableTargets: ['p0'] }), null)).toEqual(
      [],
    );
    expect(boardTargets(prompt({ kind: 'GAME_SELECT', selectableTargets: ['p0'] }), game)).toEqual(
      [],
    );
    expect(boardTargets(prompt({ kind: 'GAME_TARGET' }), game)).toEqual([]);
  });

  it('names a planeswalker defender and the player it belongs to, planeswalker first', () => {
    const walker = permanent('walker', 'Legendary Planeswalker - Nixilis');
    const game = gameWith([
      seat(0, { isMe: true }).player,
      seat(1, { battlefield: [walker] }).player,
    ]);
    const p = prompt({
      kind: 'GAME_TARGET',
      message: 'Select a player, planeswalker, or battle to attack',
      required: true,
      selectableTargets: ['p1', 'walker'],
    });

    expect(boardTargets(p, game)).toEqual([
      { id: 'walker', label: 'walker', detail: "Player 1's planeswalker", chosen: false },
      { id: 'p1', label: 'Player 1', detail: 'player', chosen: false },
    ]);
  });

  it('names every attacker a blocker may block, and flags the ones already chosen', () => {
    const bear = permanent('bear', 'Creature - Bear');
    const wolf = permanent('wolf', 'Creature - Wolf');
    const game = gameWith([
      seat(0, { battlefield: [bear, wolf] }).player,
      seat(1, { isMe: true }).player,
    ]);
    const p = prompt({
      kind: 'GAME_TARGET',
      message: 'Select attacker to block',
      selectableTargets: ['bear', 'wolf'],
      chosenTargets: ['wolf'],
    });

    expect(boardTargets(p, game)).toEqual([
      { id: 'bear', label: 'bear', detail: "Player 0's creature", chosen: false },
      { id: 'wolf', label: 'wolf', detail: "Player 0's creature", chosen: true },
    ]);
  });

  it('says "your" for your own permanents, and "you" for yourself', () => {
    const rock = permanent('rock', 'Artifact');
    const game = gameWith([seat(0, { isMe: true, battlefield: [rock] }).player]);
    const p = prompt({ kind: 'GAME_TARGET', selectableTargets: ['rock', 'p0'] });
    expect(boardTargets(p, game)).toEqual([
      { id: 'rock', label: 'rock', detail: 'your permanent', chosen: false },
      { id: 'p0', label: 'Player 0', detail: 'you', chosen: false },
    ]);
  });

  it('ignores legal targets that are not on a battlefield and not a player', () => {
    const game = gameWith([seat(0, { graveyard: [card('g1')] }).player]);
    const p = prompt({
      kind: 'GAME_TARGET',
      selectableTargets: ['g1', 'library-card', 'ability-1'],
    });
    expect(boardTargets(p, game)).toEqual([]);
  });
});

describe('boardTargetCards', () => {
  it('is empty with no prompt, no snapshot, outside GAME_TARGET, or nothing selectable', () => {
    const game = gameWith([seat(0).player]);
    expect(boardTargetCards(null, game)).toEqual([]);
    expect(
      boardTargetCards(prompt({ kind: 'GAME_TARGET', selectableTargets: ['p0'] }), null),
    ).toEqual([]);
    expect(
      boardTargetCards(prompt({ kind: 'GAME_SELECT', selectableTargets: ['p0'] }), game),
    ).toEqual([]);
    expect(boardTargetCards(prompt({ kind: 'GAME_TARGET' }), game)).toEqual([]);
  });

  it('returns the full CardView for every selectable permanent, in seat then battlefield order, and skips players', () => {
    const bear = permanent('bear', 'Creature - Bear');
    const wolf = permanent('wolf', 'Creature - Wolf');
    const game = gameWith([
      seat(0, { battlefield: [bear, wolf] }).player,
      seat(1, { isMe: true }).player,
    ]);
    const p = prompt({ kind: 'GAME_TARGET', selectableTargets: ['bear', 'wolf', 'p1'] });
    expect(boardTargetCards(p, game)).toEqual([bear.card, wolf.card]);
  });
});

describe('cardChoicePrompt', () => {
  it('is null with no prompt, outside GAME_TARGET, or with no cards', () => {
    expect(cardChoicePrompt(null)).toBeNull();
    expect(
      cardChoicePrompt(prompt({ kind: 'GAME_SELECT', targetZone: 'LIBRARY', cards: [card('c1')] })),
    ).toBeNull();
    expect(cardChoicePrompt(prompt({ kind: 'GAME_TARGET' }))).toBeNull();
  });

  it('is null when targetZone names a graveyard or exile — the zone browser answers those', () => {
    expect(
      cardChoicePrompt(
        prompt({ kind: 'GAME_TARGET', targetZone: 'GRAVEYARD', cards: [card('c1')] }),
      ),
    ).toBeNull();
    expect(
      cardChoicePrompt(
        prompt({ kind: 'GAME_TARGET', targetZone: 'exile zone', cards: [card('c1')] }),
      ),
    ).toBeNull();
  });

  it('is the prompt itself when targetZone is LIBRARY', () => {
    const p = prompt({ kind: 'GAME_TARGET', targetZone: 'LIBRARY', cards: [card('c1')] });
    expect(cardChoicePrompt(p)).toBe(p);
  });

  it('is the prompt itself when targetZone is ALL, e.g. ordering cards to the bottom of a library', () => {
    const p = prompt({ kind: 'GAME_TARGET', targetZone: 'ALL', cards: [card('c1'), card('c2')] });
    expect(cardChoicePrompt(p)).toBe(p);
  });

  it('is the prompt itself for a card list with no targetZone at all', () => {
    const p = prompt({ kind: 'GAME_TARGET', cards: [card('c1'), card('c2')] });
    expect(cardChoicePrompt(p)).toBe(p);
  });

  it('declines the trigger-ordering dialog, which has a modal of its own', () => {
    const p = prompt({
      kind: 'GAME_TARGET',
      cards: [
        { ...card('ability-1'), isAbility: true },
        { ...card('ability-2'), isAbility: true },
      ],
    });
    expect(cardChoicePrompt(p)).toBeNull();
  });
});
