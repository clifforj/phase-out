import { TestBed } from '@angular/core/testing';
import { ContextMenuComponent, type MenuAction } from './context-menu.component';

describe('ContextMenuComponent', () => {
  const actions: MenuAction[] = [
    { id: 'view', label: 'View card', hint: 'read it at full size' },
    { id: 'tap', label: 'Tap' },
  ];

  function open() {
    const fixture = TestBed.createComponent(ContextMenuComponent);
    fixture.componentRef.setInput('title', 'Birds of Paradise');
    fixture.componentRef.setInput('actions', actions);
    fixture.componentRef.setInput('x', 120);
    fixture.componentRef.setInput('y', 80);

    const chosen: string[] = [];
    const closed: number[] = [];
    fixture.componentInstance.select.subscribe((id) => chosen.push(id));
    fixture.componentInstance.close.subscribe(() => closed.push(1));
    fixture.detectChanges();

    return { fixture, element: fixture.nativeElement as HTMLElement, chosen, closed };
  }

  it('names what it is about, and offers what it was handed', () => {
    const { element } = open();
    expect(element.textContent).toContain('Birds of Paradise');

    const buttons = [...element.querySelectorAll('button')];
    expect(buttons.map((button) => button.querySelector('.label')?.textContent)).toEqual([
      'View card',
      'Tap',
    ]);
    expect(buttons[0].querySelector('.hint')?.textContent).toContain('full size');
    expect(buttons[1].querySelector('.hint')).toBeNull();
  });

  it('reports the id of the action chosen, not its label', () => {
    const { element, chosen } = open();
    element.querySelectorAll<HTMLButtonElement>('button')[0].click();
    expect(chosen).toEqual(['view']);
  });

  it('closes on a click outside it, whichever button it was', () => {
    const { element, closed } = open();
    const scrim = element.querySelector('.scrim')!;

    scrim.dispatchEvent(new Event('pointerdown'));
    scrim.dispatchEvent(new MouseEvent('click'));
    expect(closed.length).toBe(1);

    const menu = new MouseEvent('contextmenu', { cancelable: true });
    scrim.dispatchEvent(menu);
    expect(closed.length).toBe(2);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('ignores the click that ends the press that opened it', () => {
    const { element, closed } = open();
    const scrim = element.querySelector('.scrim')!;

    scrim.dispatchEvent(new MouseEvent('click'));
    expect(closed).toEqual([]);

    scrim.dispatchEvent(new Event('pointerdown'));
    scrim.dispatchEvent(new MouseEvent('click'));
    expect(closed.length).toBe(1);
  });

  it('opens where the click landed', () => {
    const { element } = open();
    const sheet = element.querySelector<HTMLElement>('.sheet')!;
    expect(sheet.style.getPropertyValue('--menu-x')).toBe('120px');
    expect(sheet.style.getPropertyValue('--menu-y')).toBe('80px');
  });
});
