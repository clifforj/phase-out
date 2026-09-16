import type {
  CardView,
  CommandObjectStateView,
  GameStateView,
  ManaPoolStateView,
  PermanentStateView,
  PlayableObjectView,
  PlayerStateView,
  PromptMsg,
  PromptView,
} from '../core/protocol';
import { FIXTURES } from '../testing/fixture';
import { loadFixture } from '../testing/fixture-loader';
import {
  commanderIdentity,
  manaAbilityChoice,
  manaColorChoice,
  manaPaymentPlan,
  manaSources,
  producedMana,
  unpaidManaCost,
  unpaidManaCostText,
} from './mana-payment';

function manaPrompt(cost: string, spell = 'Vampire Hexmage'): PromptView {
  return prompt({
    kind: 'GAME_PLAY_MANA',
    message: `Pay ${cost}<div style='font-size:11pt'><font color='#696969' object_id='c1'>${spell}</font> [70c]</div>`,
    expects: ['activate', 'cancel', 'payManaFromPool', 'special'],
  });
}

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

function permanent(
  objectId: string,
  name: string,
  typeLine: string,
  rules: string[],
): PermanentStateView {
  const card: CardView = {
    objectId,
    name,
    typeLine,
    rules,
    colors: [],
    icons: [],
    faceDown: false,
    isToken: false,
    counters: [],
    targets: [],
  };
  return {
    card,
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

function basic(objectId: string, letter: 'W' | 'U' | 'B' | 'R' | 'G'): PermanentStateView {
  const names = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' } as const;
  return permanent(objectId, names[letter], `Basic Land  - ${names[letter]}`, [
    `{T}: Add {${letter}}.`,
  ]);
}

function playable(objectId: string, abilityTexts: string[]): PlayableObjectView {
  return {
    objectId,
    playableAbilityCount: abilityTexts.length,
    playableImportantCount: 0,
    abilityTexts,
    abilityIds: abilityTexts.map((_, index) => `${objectId}-a${index}`),
  };
}

function pool(overrides: Partial<ManaPoolStateView> = {}): ManaPoolStateView {
  return { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0, ...overrides };
}

function commander(colors: string[]): CommandObjectStateView {
  return {
    objectId: 'cmdr',
    name: 'Terra, Herald of Hope',
    rules: [],
    card: {
      objectId: 'cmdr',
      name: 'Terra, Herald of Hope',
      typeLine: 'Legendary Creature  - Human Wizard Warrior',
      rules: [],
      colors,
      icons: [],
      faceDown: false,
      isToken: false,
      counters: [],
      targets: [],
    },
  };
}

function identityLand(objectId: string, name = 'Command Tower'): PermanentStateView {
  return permanent(objectId, name, 'Land ', [
    "{T}: Add one mana of any color in your commander's color identity.",
  ]);
}

function board(
  battlefield: PermanentStateView[],
  options: {
    manaPool?: ManaPoolStateView;
    playable?: PlayableObjectView[];
    commandZone?: CommandObjectStateView[];
  } = {},
): GameStateView {
  const me: PlayerStateView = {
    playerId: 'me',
    name: 'me',
    life: 40,
    isMe: true,
    isHuman: true,
    isActive: true,
    hasPriority: true,
    hasLeft: false,
    libraryCount: 90,
    handCount: 5,
    wins: 0,
    winsNeeded: 1,
    manaPool: options.manaPool ?? pool(),
    battlefield,
    graveyard: [],
    exile: [],
    commandZone: options.commandZone ?? [],
    counters: [],
    designations: [],
    monarch: false,
    initiative: false,
  };
  return {
    turn: 3,
    isPlayer: true,
    specialActionAvailable: false,
    players: [me],
    myHand: [],
    stack: [],
    combat: [],
    playable:
      options.playable ?? battlefield.map((one) => playable(one.card.objectId, one.card.rules)),
  };
}

function taps(plan: ReturnType<typeof manaPaymentPlan>, game: GameStateView): string[] {
  const byId = new Map(
    game.players[0].battlefield.map((one) => [one.card.objectId, one.card.name]),
  );
  return (plan ?? [])
    .filter((step) => step.kind === 'tap')
    .map((step) => byId.get((step as { objectId: string }).objectId) ?? '?');
}

describe('unpaidManaCostText', () => {
  it('takes the cost out of the prompt message and leaves the spell name behind', () => {
    expect(unpaidManaCostText(manaPrompt('{2}{B}'))).toBe('{2}{B}');
  });

  it('is empty for anything that is not a mana prompt', () => {
    expect(unpaidManaCostText(prompt({ kind: 'GAME_SELECT' }))).toBe('');
    expect(unpaidManaCostText(null)).toBe('');
  });
});

describe('unpaidManaCost', () => {
  it('reads a generic-plus-coloured cost as one generic need and one per pip', () => {
    expect(unpaidManaCost(manaPrompt('{2}{B}{B}'))).toEqual([
      { raw: '2', letters: [], count: 2 },
      { raw: 'B', letters: ['B'], count: 1 },
      { raw: 'B', letters: ['B'], count: 1 },
    ]);
  });

  it('keeps colourless as its own requirement, not as generic', () => {
    expect(unpaidManaCost(manaPrompt('{C}'))).toEqual([{ raw: 'C', letters: ['C'], count: 1 }]);
  });

  it('reads the hybrids as the set of things that pay them', () => {
    expect(unpaidManaCost(manaPrompt('{W/U}'))).toEqual([
      { raw: 'W/U', letters: ['W', 'U'], count: 1 },
    ]);

    expect(unpaidManaCost(manaPrompt('{2/W}'))).toEqual([{ raw: '2/W', letters: ['W'], count: 1 }]);
    expect(unpaidManaCost(manaPrompt('{B/P}'))).toEqual([{ raw: 'B/P', letters: ['B'], count: 1 }]);
  });

  it('refuses a cost with a token it does not model, rather than parsing the rest', () => {
    expect(unpaidManaCost(manaPrompt('{1}{S}'))).toBeNull();
  });

  it('refuses a cost that is not made only of symbols it recognised', () => {
    expect(unpaidManaCost(manaPrompt('{1} and two life'))).toBeNull();
    expect(unpaidManaCost(prompt({ kind: 'GAME_PLAY_MANA', message: 'Pay something' }))).toBeNull();
  });
});

describe('producedMana', () => {
  it('reads a plain tap-for-mana ability', () => {
    expect(producedMana('{T}: Add {B}.')).toEqual(['B']);
    expect(producedMana('{T}: Add {C}{C}.')).toEqual(['C']);
    expect(producedMana('{T}: Add {W} or {U}.')).toEqual(['W', 'U']);
    expect(producedMana('{T}: Add one mana of any color.')).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(producedMana('{T}: Add one mana of any type.')).toEqual(['W', 'U', 'B', 'R', 'G', 'C']);
  });

  it('reads a mana ability whose own cost is mana too, not just {T}', () => {
    expect(producedMana('{U/R}, {T}: Add {U}{U}.')).toEqual(['U']);
    expect(producedMana('{U/R}, {T}: Add {U}{R}.')).toEqual(['U', 'R']);
    expect(producedMana('{1}, {T}: Add {B}{R}.')).toEqual(['B', 'R']);
  });

  it('refuses anything with a non-mana cost, a condition or an amount nobody can predict', () => {
    expect(producedMana('{T}, Sacrifice this artifact: Add one mana of any color.')).toBeNull();
    expect(producedMana('{T}: Add {B} for each black creature card in your graveyard.')).toBeNull();
    expect(producedMana('{T}: Draw a card.')).toBeNull();

    expect(producedMana('{T}: Add {B} for each black creature card in your...')).toBeNull();
  });

  it('reads the mana out of an ability with a rider after it', () => {
    expect(
      producedMana(
        "{T}: Add one mana of any color in your commander's color identity. When that mana is spent " +
          'to cast a creature spell that shares a creature type with your commander, scry 1.',
        ['W', 'B'],
      ),
    ).toEqual(['W', 'B']);
    expect(producedMana('{T}: Add {C}{C}. {this} deals 2 damage to you.')).toEqual(['C']);
  });
});

describe('commanderIdentity', () => {
  it('reads the identity off a commander in the command zone', () => {
    const game = board([], { commandZone: [commander(['W', 'B', 'R'])] });
    expect(commanderIdentity(game)).toEqual(['W', 'B', 'R']);
  });

  it('reads it off a commander that has been cast, which leaves the command zone empty', () => {
    const cast = permanent('c1', 'Terra, Herald of Hope', 'Legendary Creature  - Human Wizard', []);
    cast.card.colors = ['W', 'B', 'R'];
    cast.card.icons = [{ type: 'COMMANDER', text: '', hint: 'Commander' }];
    expect(commanderIdentity(board([cast]))).toEqual(['W', 'B', 'R']);
  });

  it('is empty when no commander can be found in either place', () => {
    expect(commanderIdentity(board([basic('l1', 'B')]))).toEqual([]);
    expect(commanderIdentity(null)).toEqual([]);
  });
});

describe('manaSources', () => {
  it('takes what a permanent produces from its playable abilities', () => {
    const game = board([basic('l1', 'B'), basic('l2', 'G')]);
    expect(manaSources(game)).toEqual([
      {
        objectId: 'l1',
        name: 'Swamp',
        letters: ['B'],
        basic: true,
        creature: false,
        lifeCost: false,
      },
      {
        objectId: 'l2',
        name: 'Forest',
        letters: ['G'],
        basic: true,
        creature: false,
        lifeCost: false,
      },
    ]);
  });

  it('reads a filter land’s three combinations as one source that makes every colour they touch', () => {
    const cascadeBluffs = permanent('f1', 'Cascade Bluffs', 'Land ', [
      '{T}: Add {C}.',
      '{U/R}, {T}: Add {U}{U}.',
      '{U/R}, {T}: Add {U}{R}.',
      '{U/R}, {T}: Add {R}{R}.',
    ]);
    expect(manaSources(board([cascadeBluffs]))).toEqual([
      {
        objectId: 'f1',
        name: 'Cascade Bluffs',
        letters: ['U', 'R', 'C'],
        basic: false,
        creature: false,
        lifeCost: false,
      },
    ]);
  });

  it('marks a creature that makes mana, and a source that costs life to use', () => {
    const dork = permanent('d1', 'Llanowar Elves', 'Creature  - Elf Druid', ['{T}: Add {G}.']);
    const painland = permanent('p1', 'Adarkar Wastes', 'Land ', [
      '{T}: Add {C}.',
      '{T}: Add {W} or {U}. Adarkar Wastes deals 1 damage to you.',
    ]);
    const [elves, wastes] = manaSources(board([dork, painland]));
    expect(elves).toMatchObject({ creature: true, lifeCost: false });

    expect(wastes).toMatchObject({ letters: ['W', 'U', 'C'], creature: false, lifeCost: true });
  });

  it('unions a dual land’s two separate mana abilities', () => {
    const dual = permanent('d1', 'Underground Sea', 'Land ', ['{T}: Add {U}.', '{T}: Add {B}.']);
    expect(manaSources(board([dual]))[0]).toMatchObject({ letters: ['U', 'B'], basic: false });
  });

  it('puts a truncated ability text back together from the card’s own rules', () => {
    const long = '{T}: Add {B} for each black creature card in your graveyard.';
    const crypt = permanent('c1', 'Crypt of Agadeem', 'Land ', ['{T}: Add {B}.', long]);
    const game = board([crypt], {
      playable: [playable('c1', ['{T}: Add {B}.', `${long.slice(0, 49)}...`])],
    });

    expect(manaSources(game)).toEqual([
      {
        objectId: 'c1',
        name: 'Crypt of Agadeem',
        letters: ['B'],
        basic: false,
        creature: false,
        lifeCost: false,
      },
    ]);
  });

  it('reads a colour-identity land as the commander’s colours', () => {
    const game = board([identityLand('l1')], {
      commandZone: [commander(['W', 'B', 'R'])],
      playable: [playable('l1', ["{T}: Add one mana of any color in your commander'..."])],
    });
    expect(manaSources(game)).toEqual([
      {
        objectId: 'l1',
        name: 'Command Tower',
        letters: ['W', 'B', 'R'],
        basic: false,
        creature: false,
        lifeCost: false,
      },
    ]);
  });

  it('does not offer a colour-identity land when no commander can be found', () => {
    expect(manaSources(board([identityLand('l1')]))).toEqual([]);
  });

  it('ignores a tapped permanent, and one whose playable abilities make no mana', () => {
    const tapped = { ...basic('l1', 'B'), tapped: true };
    const quarter = permanent('l2', 'Ghost Quarter', 'Land ', [
      '{T}, Sacrifice {this}: Destroy target land. Its controller may search their library…',
    ]);

    expect(manaSources(board([tapped, quarter]))).toEqual([]);
  });

  it('is empty when there is no board, or nothing XMage says is playable', () => {
    expect(manaSources(null)).toEqual([]);
    expect(manaSources(board([basic('l1', 'B')], { playable: [] }))).toEqual([]);
  });
});

describe('manaPaymentPlan', () => {
  it('taps one source per mana of the cost', () => {
    const game = board([basic('l1', 'B'), basic('l2', 'B'), basic('l3', 'B')]);
    const plan = manaPaymentPlan(manaPrompt('{B}{B}'), game);
    expect(plan).toHaveLength(2);
    expect(taps(plan, game)).toEqual(['Swamp', 'Swamp']);
  });

  it('spends mana already in the pool before tapping anything', () => {
    const game = board([basic('l1', 'B')], { manaPool: pool({ black: 1 }) });
    const plan = manaPaymentPlan(manaPrompt('{B}{B}'), game);
    expect(plan?.[0]).toMatchObject({ kind: 'pool', manaType: 'BLACK' });
    expect(plan?.[1]).toMatchObject({ kind: 'tap', objectId: 'l1' });
  });

  it('does not offer pool mana that cannot pay any part of the cost', () => {
    const game = board([basic('l1', 'B')], { manaPool: pool({ white: 3 }) });
    expect(manaPaymentPlan(manaPrompt('{B}'), game)).toEqual([
      { kind: 'tap', objectId: 'l1', letter: 'B', label: 'tap Swamp' },
    ]);
  });

  it('keeps the flexible sources back and spends the narrow ones first', () => {
    const tower = permanent('t1', 'Command Tower', 'Land ', ['{T}: Add one mana of any color.']);
    const game = board([tower, basic('l1', 'B')]);

    expect(taps(manaPaymentPlan(manaPrompt('{B}'), game), game)).toEqual(['Swamp']);
  });

  it('prefers a basic land to a rock that makes the same mana', () => {
    const diamond = permanent('r1', 'Charcoal Diamond', 'Artifact ', ['{T}: Add {B}.']);
    const game = board([diamond, basic('l1', 'B')]);
    expect(taps(manaPaymentPlan(manaPrompt('{B}'), game), game)).toEqual(['Swamp']);
  });

  it('prefers a land or artifact to a creature that makes the same mana', () => {
    const dork = permanent('d1', 'Llanowar Elves', 'Creature  - Elf Druid', ['{T}: Add {G}.']);
    const rock = permanent('r1', 'Charcoal Diamond', 'Artifact ', ['{T}: Add {G}.']);
    expect(
      taps(manaPaymentPlan(manaPrompt('{G}'), board([dork, rock])), board([dork, rock])),
    ).toEqual(['Charcoal Diamond']);
  });

  it('still taps the creature when it is the only thing that can pay a need', () => {
    const dork = permanent('d1', 'Llanowar Elves', 'Creature  - Elf Druid', ['{T}: Add {G}.']);
    const game = board([dork, basic('l1', 'W')]);
    expect(taps(manaPaymentPlan(manaPrompt('{W}{G}'), game), game).sort()).toEqual([
      'Llanowar Elves',
      'Plains',
    ]);
  });

  it('spends every other source before one that costs life', () => {
    const painland = permanent('p1', 'Adarkar Wastes', 'Land ', [
      '{T}: Add {C}.',
      '{T}: Add {W} or {U}. Adarkar Wastes deals 1 damage to you.',
    ]);
    const dork = permanent('d1', 'Willbender', 'Creature  - Human Wizard', ['{T}: Add {W}.']);

    expect(
      taps(
        manaPaymentPlan(manaPrompt('{W}'), board([painland, basic('l1', 'W')])),
        board([painland, basic('l1', 'W')]),
      ),
    ).toEqual(['Plains']);
    expect(
      taps(manaPaymentPlan(manaPrompt('{W}'), board([painland, dork])), board([painland, dork])),
    ).toEqual(['Willbender']);
  });

  it('taps the painland rather than leaving the cost unpaid', () => {
    const painland = permanent('p1', 'Adarkar Wastes', 'Land ', [
      '{T}: Add {C}.',
      '{T}: Add {W} or {U}. Adarkar Wastes deals 1 damage to you.',
    ]);
    expect(taps(manaPaymentPlan(manaPrompt('{W}'), board([painland])), board([painland]))).toEqual([
      'Adarkar Wastes',
    ]);
  });

  it('fills the coloured pips before the generic part', () => {
    const game = board([basic('l1', 'B'), basic('l2', 'G')]);
    const plan = manaPaymentPlan(manaPrompt('{1}{B}'), game);
    expect(plan).toHaveLength(2);
    expect(taps(plan, game).sort()).toEqual(['Forest', 'Swamp']);
  });

  it('backs out of a preferred choice that leaves the rest unpayable', () => {
    const game = board([basic('l1', 'W'), basic('l2', 'U')]);
    const plan = manaPaymentPlan(manaPrompt('{W/U}{W/B}'), game);
    expect(plan).toHaveLength(2);
    expect(taps(plan, game).sort()).toEqual(['Island', 'Plains']);
  });

  it('offers nothing at all when the whole cost cannot be covered', () => {
    const game = board([basic('l1', 'B')]);
    expect(manaPaymentPlan(manaPrompt('{B}{B}'), game)).toBeNull();
    expect(manaPaymentPlan(manaPrompt('{G}'), game)).toBeNull();

    expect(manaPaymentPlan(manaPrompt('{C}'), game)).toBeNull();
  });

  it('taps a filter land for a cost only its converted mana can pay', () => {
    const cascadeBluffs = permanent('f1', 'Cascade Bluffs', 'Land ', [
      '{T}: Add {C}.',
      '{U/R}, {T}: Add {U}{U}.',
      '{U/R}, {T}: Add {U}{R}.',
      '{U/R}, {T}: Add {R}{R}.',
    ]);

    const game = board([cascadeBluffs]);
    expect(taps(manaPaymentPlan(manaPrompt('{R}'), game), game)).toEqual(['Cascade Bluffs']);
  });

  it('offers nothing for a prompt that is not a mana prompt', () => {
    expect(manaPaymentPlan(prompt({ kind: 'GAME_SELECT' }), board([basic('l1', 'B')]))).toBeNull();
    expect(manaPaymentPlan(null, null)).toBeNull();
  });
});

describe('against the real captured mana prompts', () => {
  const manaPrompts = loadFixture(FIXTURES.playerVsAi)
    .map((line) => line.frame)
    .filter(
      (frame): frame is PromptMsg =>
        frame.type === 'prompt' && frame.prompt.kind === 'GAME_PLAY_MANA',
    );

  it('finds one in the capture to test against', () => {
    expect(manaPrompts.length).toBeGreaterThan(4);
  });

  it('plans a complete payment for each of them, tapping only real mana sources', () => {
    for (const frame of manaPrompts) {
      const cost = unpaidManaCostText(frame.prompt);
      const needs = unpaidManaCost(frame.prompt);
      expect(needs, cost).not.toBeNull();
      const owed = needs!.reduce((total, need) => total + need.count, 0);

      const plan = manaPaymentPlan(frame.prompt, frame.game ?? null);
      expect(plan, cost).not.toBeNull();

      expect(plan, cost).toHaveLength(owed);

      const sources = new Map(
        manaSources(frame.game ?? null).map((source) => [source.objectId, source]),
      );
      for (const step of plan!) {
        if (step.kind !== 'tap') continue;
        expect(sources.get(step.objectId), `${cost}: ${step.label}`).toBeTruthy();
      }
    }
  });

  it('reads the real ability texts as the mana they make, and the rest as no mana at all', () => {
    const all = manaPrompts.flatMap((frame) => manaSources(frame.game ?? null));
    const byName = new Map(all.map((source) => [source.name, source]));

    expect(byName.get('Swamp')).toMatchObject({ letters: ['B'], basic: true });

    expect(byName.get('Ghost Quarter')).toMatchObject({ letters: ['C'], basic: false });

    expect(byName.has('Vampire Hexmage')).toBe(false);
  });
});

describe('manaColorChoice', () => {
  const picker = prompt({
    kind: 'GAME_CHOOSE_CHOICE',
    message: 'Pick a mana color',
    choices: [
      { key: 'White', label: 'White' },
      { key: 'Black', label: 'Black' },
      { key: 'Red', label: 'Red' },
    ],
    expects: ['chooseValue'],
  });

  it('answers with the colour the plan meant that source to make', () => {
    expect(manaColorChoice(picker, 'B')).toBe('Black');
  });

  it('hands it back when the plan wanted a colour that is not on offer', () => {
    expect(manaColorChoice(picker, 'G')).toBeNull();
    expect(manaColorChoice(picker, null)).toBeNull();
  });

  it('hands back a mid-payment choice that is not the colour picker at all', () => {
    const modes = prompt({
      kind: 'GAME_CHOOSE_CHOICE',
      choices: [
        { key: 'creature', label: 'Creature' },
        { key: 'land', label: 'Land' },
      ],
    });
    expect(manaColorChoice(modes, 'B')).toBeNull();
  });
});

describe('manaAbilityChoice', () => {
  const needs = unpaidManaCost(manaPrompt('{B}'))!;

  it('picks the plain mana ability out of an ability picker, past XMage’s list numbering', () => {
    const picker = prompt({
      kind: 'GAME_CHOOSE_ABILITY',
      choices: [
        { key: 'a1', label: '1. {T}: Add {B}.' },
        {
          key: 'a2',
          label: '2. {2}, {T}: Add {B} for each black creature card in your graveyard.',
        },
      ],
    });
    expect(manaAbilityChoice(picker, needs)).toBe('a1');
  });

  it('prefers the ability that pays a coloured pip over one that only makes something else', () => {
    const picker = prompt({
      kind: 'GAME_CHOOSE_ABILITY',
      choices: [
        { key: 'a1', label: '1. {T}: Add {C}.' },
        { key: 'a2', label: '2. {T}: Add {B}.' },
      ],
    });
    expect(manaAbilityChoice(picker, needs)).toBe('a2');
  });

  it('hands the choice back when nothing on offer is understood or useful', () => {
    const unreadable = prompt({
      kind: 'GAME_CHOOSE_ABILITY',
      choices: [{ key: 'a1', label: '1. {T}: Add {G}.' }],
    });
    expect(manaAbilityChoice(unreadable, needs)).toBeNull();
    expect(manaAbilityChoice(prompt({ kind: 'GAME_SELECT' }), needs)).toBeNull();
    expect(manaAbilityChoice(unreadable, [])).toBeNull();
  });

  it('picks the filter combination that matches what is still owed, past the free colourless ability', () => {
    const owedRed = unpaidManaCost(manaPrompt('{R}'))!;
    const picker = prompt({
      kind: 'GAME_CHOOSE_ABILITY',
      choices: [
        { key: 'a1', label: '1. {T}: Add {C}.' },
        { key: 'a2', label: '2. {U/R}, {T}: Add {U}{U}.' },
        { key: 'a3', label: '3. {U/R}, {T}: Add {U}{R}.' },
        { key: 'a4', label: '4. {U/R}, {T}: Add {R}{R}.' },
      ],
    });
    expect(manaAbilityChoice(picker, owedRed)).toBe('a4');
  });
});
