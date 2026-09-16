import { TestBed } from '@angular/core/testing';
import { CostTagComponent } from './cost-tag.component';
import { GameStore } from '../../core/game-store';
import { BRIDGE_SOCKET_FACTORY } from '../../core/bridge-socket';
import { fakeSocketFactory, FakeSocket } from '../../testing/fake-socket';
import type { GameStateView, PlayerStateView, PromptView } from '../../core/protocol';

function player(overrides: Partial<PlayerStateView> = {}): PlayerStateView {
  return {
    playerId: 'p0',
    name: 'clifforj',
    life: 40,
    isMe: true,
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

function game(overrides: Partial<GameStateView> = {}): GameStateView {
  return {
    turn: 1,
    isPlayer: true,
    specialActionAvailable: false,
    players: [player()],
    myHand: [],
    stack: [],
    combat: [],
    playable: [],
    ...overrides,
  };
}

function render(inputs: { spellName: string; left?: number; top?: number }) {
  const socket = new FakeSocket();
  TestBed.configureTestingModule({
    providers: [{ provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) }],
  });
  const store = TestBed.inject(GameStore);
  store.role.set('player');
  store.gameId.set('g1');
  store.snapshot.set(game());
  store.prompt.set({
    kind: 'GAME_PLAY_MANA',
    message: 'Pay {2}{B}',
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
  } satisfies PromptView);

  const fixture = TestBed.createComponent(CostTagComponent);
  fixture.componentRef.setInput('spellName', inputs.spellName);
  fixture.componentRef.setInput('left', inputs.left ?? 400);
  fixture.componentRef.setInput('top', inputs.top ?? 200);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return {
    store,
    element,
    sync: () => fixture.detectChanges(),
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  };
}

describe('CostTagComponent', () => {
  it('names the spell and draws what is left to pay as symbols', () => {
    const view = render({ spellName: 'Grave Titan' });

    expect(view.text()).toContain('Grave Titan');
    expect(view.text()).toContain('still to pay');

    expect(view.element.querySelectorAll('app-mana-symbol').length).toBe(2);
  });

  it('sits at the anchor it was given', () => {
    const view = render({ spellName: 'Doom Blade', left: 612, top: 244 });
    const host = view.element as HTMLElement;

    expect(host.style.left).toBe('612px');
    expect(host.style.top).toBe('244px');
  });

  it('hosts the full mana-payment panel, not just an auto-pay button', () => {
    const view = render({ spellName: 'Doom Blade' });

    expect(view.element.querySelector('app-mana-prompt')).toBeTruthy();
    expect(view.element.querySelector('.controls button.secondary')?.textContent).toContain(
      'cancel',
    );
  });
});
