import { TestBed } from '@angular/core/testing';
import { ActionBarComponent } from './action-bar.component';
import { GameStore } from '../../../core/game-store';
import { BRIDGE_SOCKET_FACTORY } from '../../../core/bridge-socket';
import { FakeSocket, fakeSocketFactory } from '../../../testing/fake-socket';
import type {
  CardView,
  CombatGroupStateView,
  GameStateView,
  PermanentStateView,
  PlayerStateView,
  PromptView,
} from '../../../core/protocol';

function prompt(overrides: Partial<PromptView> = {}): PromptView {
  return {
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
    ...overrides,
  };
}

function player(index: number, overrides: Partial<PlayerStateView> = {}): PlayerStateView {
  return {
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
}

function cardOf(objectId: string, name: string, rules: string[] = []): CardView {
  return {
    objectId,
    name,
    rules,
    colors: [],
    icons: [],
    faceDown: false,
    isToken: false,
    counters: [],
    targets: [],
  };
}

function permanent(objectId: string, name: string, typeLine: string): PermanentStateView {
  return {
    card: {
      objectId,
      name,
      typeLine,
      rules: [],
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

function game(players: PlayerStateView[], combat: CombatGroupStateView[] = []): GameStateView {
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

function render() {
  const socket = new FakeSocket();
  TestBed.configureTestingModule({
    providers: [{ provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) }],
  });
  const store = TestBed.inject(GameStore);
  const fixture = TestBed.createComponent(ActionBarComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;

  return {
    store,
    socket,
    element,
    sync: () => fixture.detectChanges(),
  };
}

describe('ActionBarComponent', () => {
  it('renders nothing for a spectator', () => {
    const { store, element, sync } = render();
    store.role.set('spectator');
    store.gameId.set('g1');
    store.prompt.set(prompt());
    sync();
    expect(element.querySelector('.bar')).toBeNull();
  });

  it('shows a waiting state for a player with no outstanding prompt', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    sync();
    expect(element.querySelector('.waiting')?.textContent).toContain('waiting');
  });

  it('stops claiming a turn is in progress once the game is over', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.snapshot.set(game([player(1, { isMe: true, isActive: true }), player(2)]));
    sync();
    expect(element.querySelector('.waiting')?.textContent).toContain('your turn');

    store.watchState.set('over');
    sync();
    const waiting = element.querySelector('.waiting')?.textContent ?? '';
    expect(waiting).toContain('over');
    expect(waiting).not.toContain('your turn');
  });

  it('stays in the waiting state for a prompt that is going to auto-pass', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.prompt.set(prompt({ kind: 'GAME_SELECT', expects: ['activate', 'passPriority'] }));
    store.autoPassMs.set(300);
    sync();

    expect(element.querySelector('.headline')).toBeNull();
    expect(element.querySelector('.waiting')).not.toBeNull();
    expect(element.querySelector('.bar')?.classList.contains('active')).toBe(false);

    store.autoPassMs.set(null);
    sync();
    expect(element.querySelector('.headline')?.textContent).toContain('Your priority');
  });

  it("strips XMage's own HTML out of the prompt message", () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.prompt.set(
      prompt({
        message: "Mulligan <font color='#ffff00'>down to 6 cards</font>?",
        okButtonText: 'Mulligan',
        cancelButtonText: 'Keep',
      }),
    );
    sync();

    const message = element.querySelector('.message')?.textContent ?? '';
    expect(message).toContain('Mulligan down to 6 cards?');
    expect(message).not.toMatch(/<[a-z]/i);

    const buttons = [...element.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(buttons).toContain('Mulligan');
    expect(buttons).toContain('Keep');
  });

  it('offers pass priority at an ordinary GAME_SELECT, labelled for the combat step when there is one', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.prompt.set(
      prompt({ kind: 'GAME_SELECT', expects: ['activate', 'passPriority', 'special'] }),
    );
    sync();
    expect(element.querySelector('.headline')?.textContent).toContain('Your priority');
    expect(element.textContent).toContain('pass priority');

    store.prompt.set(
      prompt({
        kind: 'GAME_SELECT',
        combatStep: 'DECLARE_ATTACKERS',
        possibleAttackers: ['c1'],
        expects: ['activate', 'passPriority', 'special'],
      }),
    );
    sync();
    expect(element.querySelector('.headline')?.textContent).toContain('Declare attackers');
    expect(element.textContent).toContain('attack with none');
  });

  it('turns the pass button into "done" once something is declared, counting what is attacking', () => {
    const { store, socket, element, sync } = render();
    store.connect();
    socket.open();
    store.role.set('player');
    store.gameId.set('g1');
    store.snapshot.set(
      game(
        [
          player(0, {
            isMe: true,
            battlefield: [
              permanent('bear', 'Grizzly Bears', 'Creature - Bear'),
              permanent('wolf', 'Timber Wolves', 'Creature - Wolf'),
              permanent('ogre', 'Ogre', 'Creature - Ogre'),
            ],
          }),
          player(1),
        ],
        [
          {
            blocked: false,
            defenderName: 'Player 1',
            attackers: [cardOf('bear', 'Grizzly Bears')],
            blockers: [],
          },
        ],
      ),
    );
    store.prompt.set(
      prompt({
        kind: 'GAME_SELECT',
        message: 'Select attackers',
        combatStep: 'DECLARE_ATTACKERS',
        possibleAttackers: ['wolf', 'ogre'],
        specialButtonText: 'All attack',
        expects: ['activate', 'passPriority', 'special'],
      }),
    );
    sync();

    expect(element.querySelector('.primary')?.textContent).toContain(
      'done - attack with 1 creature',
    );
    expect(element.textContent).toContain('one at a time');

    const declared = [
      ...element.querySelectorAll('.controls.targets button'),
    ] as HTMLButtonElement[];
    expect(declared.map((b) => b.querySelector('.target-name')?.textContent?.trim())).toEqual([
      'Grizzly Bears',
    ]);
    expect(declared[0].querySelector('.target-detail')?.textContent).toContain(
      'attacking Player 1',
    );
    declared[0].click();
    expect(socket.lastSentOfType<{ objectId: string }>('activate')?.objectId).toBe('bear');
  });

  it('still reads as the attack step when every eligible creature is already attacking', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.snapshot.set(
      game(
        [
          player(0, {
            isMe: true,
            battlefield: [permanent('bear', 'Grizzly Bears', 'Creature - Bear')],
          }),
          player(1),
        ],
        [
          {
            blocked: false,
            defenderName: 'Player 1',
            attackers: [cardOf('bear', 'Grizzly Bears')],
            blockers: [],
          },
        ],
      ),
    );
    store.prompt.set(
      prompt({
        kind: 'GAME_SELECT',
        combatStep: 'DECLARE_ATTACKERS',
        possibleAttackers: [],
        expects: ['activate', 'passPriority', 'special'],
      }),
    );
    sync();

    expect(element.querySelector('.headline')?.textContent).toContain('Declare attackers');
    expect(element.querySelector('.primary')?.textContent).toContain(
      'done - attack with 1 creature',
    );
    expect(element.querySelector('.controls.skip-ahead')).toBeNull();
  });

  it('offers the special payment at a mana prompt, named after the spell’s keyword', () => {
    const { store, socket, element, sync } = render();
    store.connect();
    socket.open();
    store.role.set('player');
    store.gameId.set('g1');
    const state = game([player(0, { isMe: true }), player(1)]);
    store.snapshot.set({
      ...state,
      specialActionAvailable: true,
      stack: [
        cardOf('spell', 'Herald of Anguish', [
          'improvise <i>(Your artifacts can help cast this spell…)</i>',
        ]),
      ],
    });
    store.prompt.set(
      prompt({
        kind: 'GAME_PLAY_MANA',
        message: 'Pay {4}{B}{B}',
        expects: ['activate', 'special'],
      }),
    );
    sync();

    const special = element.querySelector('button.special') as HTMLButtonElement | null;
    expect(special?.textContent).toContain('improvise');
    expect(special?.textContent).toContain('tap artifacts to pay');
    expect(special?.title).toContain('improvise');

    special?.click();
    expect(socket.lastSentOfType('special')).toBeTruthy();
  });

  it('draws no special button at a mana prompt when the game view offers no special action', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.snapshot.set(game([player(0, { isMe: true }), player(1)]));
    store.prompt.set(
      prompt({ kind: 'GAME_PLAY_MANA', message: 'Pay {2}', expects: ['activate', 'special'] }),
    );
    sync();

    expect(element.querySelector('button.special')).toBeNull();
  });

  it('offers a generic special button at priority when the game view reports one', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.snapshot.set({
      ...game([player(0, { isMe: true }), player(1)]),
      specialActionAvailable: true,
    });
    store.prompt.set(
      prompt({ kind: 'GAME_SELECT', expects: ['activate', 'passPriority', 'special'] }),
    );
    sync();

    expect(element.querySelector('button.special')?.textContent).toContain('special action');
  });

  it('drops the player’s own name as a prompt message, and XMage’s list numbering', () => {
    const { store, socket, element, sync } = render();
    store.connect();
    socket.open();
    store.role.set('player');
    store.gameId.set('g1');
    store.snapshot.set(game([player(0, { isMe: true, name: 'clifforj' }), player(1)]));
    store.prompt.set(
      prompt({
        kind: 'GAME_CHOOSE_ABILITY',
        message: 'clifforj',
        choices: [{ key: 'sa1', label: '1. Improvise (Your artifacts can help cast this spell.)' }],
        expects: ['chooseAbility', 'cancel'],
      }),
    );
    sync();

    expect(element.querySelector('.message')).toBeNull();
    expect(element.querySelector('.headline')?.textContent).toContain('Choose an ability');
    const choice = element.querySelector('.controls button') as HTMLButtonElement;
    expect(choice.textContent).toContain('Improvise');
    expect(choice.textContent).not.toContain('1.');

    choice.click();
    expect(socket.lastSentOfType<{ abilityId: string }>('chooseAbility')?.abilityId).toBe('sa1');
  });

  it('keeps a real prompt message', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.snapshot.set(game([player(0, { isMe: true, name: 'clifforj' }), player(1)]));
    store.prompt.set(prompt({ kind: 'GAME_ASK', message: 'Pay {2} to draw a card?' }));
    sync();

    expect(element.querySelector('.message')?.textContent).toContain('Pay');
  });

  it('offers Done, disabled, while a target selection has not reached its minimum', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.prompt.set(
      prompt({
        kind: 'GAME_TARGET',
        required: true,
        selectableTargets: ['a', 'b'],
        expects: ['chooseTarget', 'cancel'],
      }),
    );
    sync();

    const button = element.querySelector('.controls button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(element.textContent).toContain('at least one more is required');
  });

  it('names the legal targets that are on the table, and sends chooseTarget when one is pressed', () => {
    const { store, socket, element, sync } = render();
    store.connect();
    socket.open();
    store.role.set('player');
    store.gameId.set('g1');
    store.snapshot.set(
      game([
        player(0, { isMe: true }),
        player(1, {
          battlefield: [
            permanent('walker', 'Ob Nixilis of the Black Oath', 'Legendary Planeswalker - Nixilis'),
          ],
        }),
      ]),
    );
    store.prompt.set(
      prompt({
        kind: 'GAME_TARGET',
        message: 'Select a player, planeswalker, or battle to attack',
        required: true,
        selectableTargets: ['walker', 'p1'],
        expects: ['chooseTarget', 'cancel'],
      }),
    );
    sync();

    const targets = [
      ...element.querySelectorAll('.controls.targets button'),
    ] as HTMLButtonElement[];
    expect(targets.map((b) => b.querySelector('.target-name')?.textContent?.trim())).toEqual([
      'Ob Nixilis of the Black Oath',
      'Player 1',
    ]);
    expect(targets[0].querySelector('.target-detail')?.textContent).toContain('planeswalker');
    expect(element.textContent).toContain('press one above');

    targets[0].click();
    expect(socket.lastSentOfType<{ targetId: string }>('chooseTarget')?.targetId).toBe('walker');
  });

  it('swaps the inline permanent buttons for a single browse button past the target-list threshold, keeping player targets inline', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    const creatures = Array.from({ length: 9 }, (_, i) =>
      permanent(`c${i}`, `Creature ${i}`, 'Creature - Bear'),
    );
    store.snapshot.set(game([player(0, { isMe: true }), player(1, { battlefield: creatures })]));
    store.prompt.set(
      prompt({
        kind: 'GAME_TARGET',
        selectableTargets: [...creatures.map((c) => c.card.objectId), 'p0'],
        expects: ['chooseTarget', 'cancel'],
      }),
    );
    sync();

    expect(element.querySelectorAll('.controls.targets button').length).toBe(1);
    expect(element.querySelector('.target-name')?.textContent?.trim()).toBe('Player 0');
    expect(element.textContent).toContain('browse 9 more legal targets');
  });

  it('says which object the prompt is about, unless the message has said it already', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.prompt.set(
      prompt({
        kind: 'GAME_TARGET',
        message: 'Select attacker to block',
        secondMessage: "<font color='#20B2AA'>Flesh Carver</font>",
        selectableTargets: ['bear'],
        expects: ['chooseTarget', 'cancel'],
      }),
    );
    sync();
    const subject = element.querySelector('.subject')?.textContent ?? '';
    expect(subject).toContain('Flesh Carver');
    expect(subject).not.toMatch(/<[a-z]/i);

    store.prompt.set(
      prompt({
        kind: 'GAME_ASK',
        message: 'Use Flesh Carver ability?',
        secondMessage: 'Flesh Carver',
      }),
    );
    sync();
    expect(element.querySelector('.subject')).toBeNull();

    store.prompt.set(
      prompt({ kind: 'GAME_TARGET', message: 'Choose a target', secondMessage: 'Extort {W/B}' }),
    );
    sync();
    const withCost = element.querySelector('.subject')!;
    expect(withCost.textContent).not.toContain('{');
    expect(withCost.querySelector('img')?.getAttribute('alt')).toBe('white or black mana');
  });

  it('says so when a target prompt has nothing legal to choose at all', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.prompt.set(
      prompt({
        kind: 'GAME_TARGET',
        message: 'Select attacker to block',
        expects: ['chooseTarget', 'cancel'],
      }),
    );
    sync();

    expect(element.querySelector('.hint')?.textContent).toContain(
      'nothing on the board can be chosen',
    );
    expect((element.querySelector('.controls button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('tracks the running total against the overall min/max for a multi-amount prompt, disabling confirm until it matches', () => {
    const { store, element, sync } = render();
    store.role.set('player');
    store.gameId.set('g1');
    store.prompt.set(
      prompt({
        kind: 'GAME_GET_MULTI_AMOUNT',
        message: 'Assign combat damage among creatures blocking Bear, P/T: 2/2',
        min: 5,
        max: 5,
        amounts: [
          { message: 'Bear, P/T: 2/2', min: 0, max: 5, defaultValue: 2 },
          { message: 'Wolf, P/T: 3/3', min: 0, max: 5, defaultValue: 3 },
        ],
        expects: ['setAmounts', 'cancel'],
      }),
    );
    sync();

    const confirm = element.querySelector('.controls.multi .primary') as HTMLButtonElement;
    expect(element.querySelector('.hint')?.textContent).toContain('total: 5 (need 5)');
    expect(confirm.disabled).toBe(false);

    const inputs = [...element.querySelectorAll('.controls.multi input')] as HTMLInputElement[];
    inputs[0].value = '1';
    inputs[0].dispatchEvent(new Event('input'));
    sync();

    expect(element.querySelector('.hint')?.textContent).toContain('total: 4 (need 5)');
    expect(confirm.disabled).toBe(true);
  });

  describe('auto-paying a mana cost', () => {
    function swamp(objectId: string): PermanentStateView {
      const one = permanent(objectId, 'Swamp', 'Basic Land  - Swamp');
      return { ...one, card: { ...one.card, rules: ['{T}: Add {B}.'] } };
    }

    function boardWithSwamps(count: number): GameStateView {
      const swamps = Array.from({ length: count }, (_, index) => swamp(`l${index}`));
      return {
        ...game([player(0, { isMe: true, battlefield: swamps }), player(1)]),
        playable: swamps.map((one) => ({
          objectId: one.card.objectId,
          playableAbilityCount: 1,
          playableImportantCount: 0,
          abilityTexts: ['{T}: Add {B}.'],
          abilityIds: [],
        })),
      };
    }

    function manaPrompt(cost: string): PromptView {
      return prompt({
        kind: 'GAME_PLAY_MANA',
        message: `Pay ${cost}<div style='font-size:11pt'>Vampire Hexmage</div>`,
        expects: ['activate', 'cancel', 'payManaFromPool', 'special'],
      });
    }

    it('offers one button for the whole cost, and pressing it starts the payment', () => {
      const { store, socket, element, sync } = render();
      store.connect();
      socket.open();
      store.role.set('player');
      store.gameId.set('g1');
      store.snapshot.set(boardWithSwamps(2));
      store.prompt.set(manaPrompt('{B}{B}'));
      sync();

      const auto = element.querySelector('.controls .primary') as HTMLButtonElement;
      expect(auto.textContent).toContain('auto-pay');

      expect(auto.title).toContain('tap Swamp, tap Swamp');

      auto.click();
      expect(socket.lastSentOfType<{ objectId: string }>('activate')?.objectId).toBe('l0');
      expect(store.autoPaying()).toBe(true);
    });

    it('offers no button at all when it cannot pay the whole cost', () => {
      const { store, element, sync } = render();
      store.role.set('player');
      store.gameId.set('g1');
      store.snapshot.set(boardWithSwamps(1));
      store.prompt.set(manaPrompt('{B}{B}'));
      sync();

      expect(element.querySelector('.controls .primary')).toBeNull();
      expect(element.textContent).not.toContain('auto-pay');
    });

    it('says it is paying while it works through the cost', () => {
      const { store, element, sync } = render();
      store.role.set('player');
      store.gameId.set('g1');

      store.autoPaying.set(true);
      store.prompt.set(null);
      sync();

      expect(element.querySelector('.hint')?.textContent).toContain('paying the cost');
    });
  });
});
