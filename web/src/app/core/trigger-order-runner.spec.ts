import { CardView } from './protocol';
import { FakeSocket } from '../testing/fake-socket';
import { seatAsPlayer, setUp } from './testing-support';

describe('committing an order for simultaneous triggers', () => {
  function ability(objectId: string, name: string, rule: string): CardView {
    return {
      objectId,
      name,
      rules: [rule],
      colors: [],
      icons: [],
      faceDown: false,
      isToken: false,
      counters: [],
      targets: [],
      isAbility: true,
    };
  }

  function emitTriggerPrompt(socket: FakeSocket, abilities: CardView[]): void {
    socket.emit({
      type: 'prompt',
      gameId: 'g1',
      prompt: {
        kind: 'GAME_TARGET',
        message: 'Pick triggered ability (goes to the stack first)',
        required: true,
        cards: abilities,
        cards2: [],
        selectableTargets: abilities.map((one) => one.objectId),
        chosenTargets: [],
        choices: [],
        amounts: [],
        possibleAttackers: [],
        possibleBlockers: [],
        expects: ['chooseTarget', 'cancel'],
      },
    });
  }

  function picks(socket: FakeSocket): string[] {
    return socket
      .sentFrames<{ type: string; targetId?: string }>()
      .filter((frame) => frame.type === 'chooseTarget')
      .map((frame) => frame.targetId ?? '');
  }

  const extort = ability('a1', 'Crypt Ghast', 'Extort');
  const drain = ability('a2', 'Herald of Anguish', 'Each opponent discards a card.');
  const gain = ability('a3', 'Blood Artist', 'Target player loses 1 life.');

  it('sends one pick for two triggers, and it is the one that resolves second', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    emitTriggerPrompt(socket, [extort, drain]);

    store.orderTriggers(['a1', 'a2']);
    expect(picks(socket)).toEqual(['a2']);

    expect(store.orderingTriggers()).toBe(true);
    expect(store.prompt()).toBeNull();
  });

  it('works through three triggers back to front, one prompt at a time', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    emitTriggerPrompt(socket, [extort, drain, gain]);

    store.orderTriggers(['a1', 'a2', 'a3']);
    expect(picks(socket)).toEqual(['a3']);

    emitTriggerPrompt(socket, [extort, drain]);
    expect(picks(socket)).toEqual(['a3', 'a2']);

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
        expects: ['passPriority'],
      },
    });
    expect(picks(socket)).toEqual(['a3', 'a2']);
    expect(store.orderingTriggers()).toBe(false);
  });

  it('refuses an order that does not account for every trigger on offer', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    emitTriggerPrompt(socket, [extort, drain, gain]);

    store.orderTriggers(['a1', 'a2']);
    expect(picks(socket)).toEqual([]);
    expect(store.orderingTriggers()).toBe(false);

    expect(store.prompt()?.kind).toBe('GAME_TARGET');
  });

  it('hands the decision back when a queued trigger is no longer on offer', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    emitTriggerPrompt(socket, [extort, drain, gain]);

    store.orderTriggers(['a1', 'a2', 'a3']);
    expect(picks(socket)).toEqual(['a3']);

    emitTriggerPrompt(socket, [extort, gain]);
    expect(picks(socket)).toEqual(['a3']);
    expect(store.orderingTriggers()).toBe(false);
    expect(store.prompt()?.cards.map((one) => one.objectId)).toEqual(['a1', 'a3']);
  });

  it('lets go when the game ends mid-order', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    emitTriggerPrompt(socket, [extort, drain, gain]);
    store.orderTriggers(['a1', 'a2', 'a3']);

    socket.emit({ type: 'gameOver', gameId: 'g1', text: 'me has won the game' });
    expect(store.orderingTriggers()).toBe(false);
  });

  it('does nothing when the outstanding prompt is not the trigger dialog', () => {
    const { socket, store } = setUp();
    seatAsPlayer(socket);
    store.orderTriggers(['a1', 'a2']);
    expect(picks(socket)).toEqual([]);
    expect(store.orderingTriggers()).toBe(false);
  });
});
