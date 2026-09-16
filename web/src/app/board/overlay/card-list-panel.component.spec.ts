import { TestBed } from '@angular/core/testing';
import { Zap } from 'lucide';
import { CardListPanelComponent } from './card-list-panel.component';
import type { CardView } from '../../core/protocol';

function card(overrides: Partial<CardView> = {}): CardView {
  return {
    objectId: 'c1',
    name: 'Herald of Anguish',
    manaCost: '{4}{B}{B}',
    typeLine: 'Artifact Creature — Demon',
    power: '5',
    toughness: '5',
    rules: ['Flying'],
    colors: ['B'],
    icons: [],
    counters: [],
    targets: [],
    faceDown: false,
    isToken: false,
    ...overrides,
  };
}

function render(cards: CardView[]) {
  const fixture = TestBed.createComponent(CardListPanelComponent);
  fixture.componentRef.setInput('heading', 'Pick triggered ability');
  fixture.componentRef.setInput('icon', Zap);
  fixture.componentRef.setInput('emptyMessage', 'Nothing left to choose.');
  fixture.componentRef.setInput('cards', cards);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('CardListPanelComponent ability rows', () => {
  it('gives an ability row the card’s name and the ability’s own text', () => {
    const { component } = render([
      card({
        objectId: 'trigger-1',
        isAbility: true,
        rules: ['Whenever an artifact enters, draw a card.'],
      }),
    ]);

    const [row] = component.rows();
    expect(row.name).toBe('Herald of Anguish');
    expect(row.type).toContain('Whenever an artifact enters');
  });

  it('drops the card’s cost and stats from an ability row', () => {
    const { component } = render([
      card({ isAbility: true, rules: ['Whenever an artifact enters, draw a card.'] }),
    ]);

    const [row] = component.rows();
    expect(row.cost).toBeUndefined();
    expect(row.stats).toBe('');
  });

  it('leaves an ordinary card row alone', () => {
    const { component } = render([card()]);

    const [row] = component.rows();
    expect(row.name).toBe('Herald of Anguish');
    expect(row.cost).toBe('{4}{B}{B}');
    expect(row.type).toBe('Artifact Creature — Demon');
    expect(row.stats).toBe('5/5');
  });

  it('renders an ability’s markup as text', () => {
    const { component } = render([
      card({
        isAbility: true,
        rules: ['Improvise <i>(Your artifacts can help cast this spell.)</i>'],
      }),
    ]);

    expect(component.rows()[0].type).not.toContain('<i>');
    expect(component.rows()[0].type).toContain('Improvise');
  });
});

describe('CardListPanelComponent preview', () => {
  function rowButtons(element: HTMLElement): HTMLButtonElement[] {
    return Array.from(element.querySelectorAll<HTMLButtonElement>('.row'));
  }

  it('keeps the hovered row while the pointer is still inside the list', () => {
    const { fixture, component, element } = render([
      card({ objectId: 'a' }),
      card({ objectId: 'b' }),
    ]);

    rowButtons(element)[1].dispatchEvent(new PointerEvent('pointerenter'));
    fixture.detectChanges();
    expect(component.shown()?.card.objectId).toBe('b');

    element.querySelector('.list')!.dispatchEvent(new PointerEvent('pointerenter'));
    fixture.detectChanges();
    expect(component.shown()?.card.objectId).toBe('b');
  });

  it('falls back to the first row once the pointer leaves the list', () => {
    const { fixture, component, element } = render([
      card({ objectId: 'a' }),
      card({ objectId: 'b' }),
    ]);

    rowButtons(element)[1].dispatchEvent(new PointerEvent('pointerenter'));
    fixture.detectChanges();
    expect(component.shown()?.card.objectId).toBe('b');

    element.querySelector('.list')!.dispatchEvent(new PointerEvent('pointerleave'));
    fixture.detectChanges();
    expect(component.shown()?.card.objectId).toBe('a');
  });
});
