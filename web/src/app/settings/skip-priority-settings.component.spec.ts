import { TestBed } from '@angular/core/testing';
import { SkipPrioritySettingsComponent } from './skip-priority-settings.component';
import { BRIDGE_SOCKET_FACTORY } from '../core/bridge-socket';
import { GameStore } from '../core/game-store';
import { DEFAULT_SKIP_PRIORITY_SETTINGS } from '../core/skip-priority-settings';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';

function render() {
  const socket = new FakeSocket();
  TestBed.configureTestingModule({
    providers: [{ provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) }],
  });

  const store = TestBed.inject(GameStore);
  store.connect();
  socket.open();
  const fixture = TestBed.createComponent(SkipPrioritySettingsComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { socket, element, sync: () => fixture.detectChanges() };
}

function switchFor(element: HTMLElement, label: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('.switch')].find((candidate) =>
    (candidate.getAttribute('aria-label') ?? '').includes(label),
  );
  if (!found) throw new Error(`no switch matching "${label}"`);
  return found as HTMLButtonElement;
}

describe('SkipPrioritySettingsComponent', () => {
  it("starts unchecked/checked exactly as XMage's own defaults", () => {
    const { element } = render();
    const boxes = [
      ...element.querySelectorAll('table input[type="checkbox"]'),
    ] as HTMLInputElement[];

    expect(boxes[0].checked).toBe(false);
    expect(boxes[4].checked).toBe(true);
  });

  it("defaults passPriorityCast/passPriorityActivation to on, unlike XMage's own default", () => {
    const { element } = render();
    expect(switchFor(element, 'after I cast').classList.contains('on')).toBe(true);
    expect(switchFor(element, 'after I activate').classList.contains('on')).toBe(true);
  });

  it('does not send anything until apply is pressed', () => {
    const { socket, element, sync } = render();
    const upkeepYourTurn = element.querySelectorAll(
      'table input[type="checkbox"]',
    )[0] as HTMLInputElement;
    upkeepYourTurn.checked = true;
    upkeepYourTurn.dispatchEvent(new Event('change'));
    sync();

    expect(socket.lastSentOfType('setSkipPrioritySteps')).toBeUndefined();

    const apply = [...element.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Apply',
    )!;
    apply.click();
    sync();

    const sent = socket.lastSentOfType<{ yourTurn: { upkeep: boolean } }>('setSkipPrioritySteps');
    expect(sent?.yourTurn.upkeep).toBe(true);
  });

  it("reset sends XMage's defaults straight away, without needing a separate apply", () => {
    const { socket, element, sync } = render();

    switchFor(element, 'stack changes').click();
    sync();

    const reset = [...element.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Reset to defaults',
    )!;
    reset.click();
    sync();

    const sent = socket.lastSentOfType<{ stopOnStackNewObjects: boolean }>('setSkipPrioritySteps');
    expect(sent?.stopOnStackNewObjects).toBe(DEFAULT_SKIP_PRIORITY_SETTINGS.stopOnStackNewObjects);
  });
});
