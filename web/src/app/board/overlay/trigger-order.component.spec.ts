import { TestBed } from '@angular/core/testing';
import { TriggerOrderComponent } from './trigger-order.component';
import type { CardView, PromptView } from '../../core/protocol';

function ability(objectId: string, name: string, rule: string): CardView {
  return {
    objectId,
    name,
    rules: [rule],
    colors: [],
    icons: [],
    counters: [],
    targets: [],
    faceDown: false,
    isToken: false,
    isAbility: true,
  };
}

function render(cards: CardView[]) {
  const prompt: PromptView = {
    kind: 'GAME_TARGET',
    message: 'Pick triggered ability (goes to the stack first)',
    required: true,
    cards,
    cards2: [],
    selectableTargets: cards.map((one) => one.objectId),
    chosenTargets: [],
    choices: [],
    amounts: [],
    possibleAttackers: [],
    possibleBlockers: [],
    expects: ['chooseTarget', 'cancel'],
  };
  const fixture = TestBed.createComponent(TriggerOrderComponent);
  fixture.componentRef.setInput('prompt', prompt);
  const committed: string[][] = [];
  fixture.componentInstance.commit.subscribe((order) => committed.push(order));
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.row'));
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    committed,
    rows,

    listing: () =>
      rows().map((row) =>
        `${row.querySelector('.badge')!.textContent} ${row.querySelector('.name')!.textContent}`.trim(),
      ),
    click: (index: number) => {
      rows()[index].click();
      fixture.detectChanges();
    },
    confirmButton: () => element.querySelector<HTMLButtonElement>('.confirm')!,
  };
}

const extort = ability('a1', 'Crypt Ghast', 'Extort');
const discard = ability('a2', 'Herald of Anguish', 'Each opponent discards a card.');
const drain = ability('a3', 'Blood Artist', 'Target player loses 1 life.');

describe('TriggerOrderComponent', () => {
  it('numbers the order as it is built, first to resolve at the top', () => {
    const view = render([extort, discard, drain]);
    expect(view.listing()).toEqual(['– Crypt Ghast', '– Herald of Anguish', '– Blood Artist']);

    view.click(2);
    expect(view.listing()).toEqual(['1st Blood Artist', '– Crypt Ghast', '– Herald of Anguish']);
    expect(view.component.order()).toEqual(['a3']);
  });

  it('places the last trigger by itself', () => {
    const view = render([extort, discard]);
    view.click(1);

    expect(view.listing()).toEqual(['1st Herald of Anguish', '2nd Crypt Ghast']);
    expect(view.component.order()).toEqual(['a2', 'a1']);
  });

  it('takes a placed trigger back out when it is clicked again, and renumbers', () => {
    const view = render([extort, discard, drain]);
    view.click(0);
    expect(view.component.order()).toEqual(['a1']);

    view.click(0);
    expect(view.component.order()).toEqual([]);
    expect(view.listing()).toEqual(['– Crypt Ghast', '– Herald of Anguish', '– Blood Artist']);
  });

  it('says which end is which, so "first" cannot be read as "on the stack first"', () => {
    const view = render([extort, discard, drain]);
    view.click(0);
    view.click(1);

    const notes = view.rows().map((row) => row.querySelector('.note')!.textContent!.trim());
    expect(notes).toEqual(['resolves first', 'then', 'resolves last']);
  });

  it('will not commit a partial order', () => {
    const view = render([extort, discard, drain]);
    expect(view.confirmButton().disabled).toBe(true);

    view.click(0);
    expect(view.confirmButton().disabled).toBe(true);
    view.confirmButton().click();
    expect(view.committed).toEqual([]);
  });

  it('commits the finished order, first to resolve first', () => {
    const view = render([extort, discard, drain]);
    view.click(2);
    view.click(1);

    expect(view.confirmButton().disabled).toBe(false);
    view.confirmButton().click();
    expect(view.committed).toEqual([['a3', 'a1', 'a2']]);
  });

  it('starts over on request', () => {
    const view = render([extort, discard, drain]);
    view.click(0);
    view.element.querySelector<HTMLButtonElement>('.ghost')!.click();
    view.fixture.detectChanges();

    expect(view.component.order()).toEqual([]);
  });
});
