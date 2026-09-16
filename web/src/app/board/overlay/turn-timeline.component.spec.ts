import { TestBed } from '@angular/core/testing';
import { TurnTimelineComponent } from './turn-timeline.component';
import { TURN_STOPS } from '../../rules/turn-timeline';

function render(inputs: {
  turn: number;
  phase?: string | null;
  step?: string | null;
  activeIsMe?: boolean;
}) {
  const fixture = TestBed.createComponent(TurnTimelineComponent);
  fixture.componentRef.setInput('turn', inputs.turn);
  fixture.componentRef.setInput('phase', inputs.phase ?? null);
  fixture.componentRef.setInput('step', inputs.step ?? null);
  fixture.componentRef.setInput('activeIsMe', inputs.activeIsMe ?? false);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return {
    element,
    text: () => element.textContent ?? '',
    lit: () => element.querySelector('.stop.now'),
    litIndex: () =>
      [...element.querySelectorAll('.stop')].findIndex((stop) => stop.classList.contains('now')),
  };
}

describe('TurnTimelineComponent', () => {
  it('draws every stop, and lights the one the step is at', () => {
    const view = render({ turn: 7, phase: 'Combat', step: 'Declare Blockers' });

    expect(view.element.querySelectorAll('.stop').length).toBe(TURN_STOPS.length);
    expect(view.litIndex()).toBe(TURN_STOPS.findIndex((stop) => stop.id === 'blockers'));
    expect(view.lit()?.getAttribute('aria-current')).toBe('step');

    expect(view.element.querySelectorAll('.stop.now').length).toBe(1);
  });

  it('states the phase and the step as readable text, and the turn on the stop list', () => {
    const view = render({ turn: 12, phase: 'Combat', step: 'Declare Attackers' });

    expect(view.text()).toContain('Combat');
    expect(view.text()).toContain('Declare Attackers');
    expect(view.element.querySelector('.stops')?.getAttribute('aria-label')).toBe(
      'turn 12 progress',
    );
  });

  it('does not print the phase twice when the step is named after it', () => {
    const view = render({ turn: 3, phase: 'Precombat Main', step: 'Precombat Main' });
    expect(view.text().match(/Precombat Main/g)).toHaveLength(1);
  });

  it('lights nothing and falls back to verbatim text for a step it does not know', () => {
    const view = render({ turn: 4, phase: 'Some New Phase', step: 'Some New Step' });

    expect(view.element.querySelectorAll('.stop.now').length).toBe(0);
    expect(view.text()).toContain('Some New Phase');
    expect(view.text()).toContain('Some New Step');
  });

  it("marks the strip as the viewer's own turn", () => {
    const mine = render({ turn: 1, step: 'Untap', activeIsMe: true });
    expect(mine.element.querySelector('.timeline')?.classList.contains('mine')).toBe(true);

    const theirs = render({ turn: 1, step: 'Untap', activeIsMe: false });
    expect(theirs.element.querySelector('.timeline')?.classList.contains('mine')).toBe(false);
  });
});
