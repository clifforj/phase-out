import { TestBed } from '@angular/core/testing';
import {
  PHASE_DWELL_MS,
  PHASE_SETTLE_MS,
  TURN_DWELL_MS,
  TurnAnnounceComponent,
} from './turn-announce.component';

interface Frame {
  turn: number;
  activePlayerId?: string | null;
  activeName?: string | null;
  activeIsMe?: boolean;
  phase?: string | null;
}

function render(first: Frame) {
  const fixture = TestBed.createComponent(TurnAnnounceComponent);
  const element = fixture.nativeElement as HTMLElement;
  const set = (frame: Frame) => {
    fixture.componentRef.setInput('turn', frame.turn);
    fixture.componentRef.setInput('activePlayerId', frame.activePlayerId ?? null);
    fixture.componentRef.setInput('activeName', frame.activeName ?? null);
    fixture.componentRef.setInput('activeIsMe', frame.activeIsMe ?? false);
    fixture.componentRef.setInput('phase', frame.phase ?? null);
    fixture.detectChanges();
  };
  set(first);
  return {
    set,

    wait: (ms: number) => {
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    },
    text: () => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    banner: () => element.querySelector('.announce'),
  };
}

describe('TurnAnnounceComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('says nothing about the frame it arrives on', () => {
    const view = render({ turn: 4, activePlayerId: 'p0', activeName: 'alice', phase: 'Combat' });
    expect(view.banner()).toBeNull();
  });

  it('announces a new turn straight away, and takes it down again', () => {
    const view = render({ turn: 4, activePlayerId: 'p0', activeName: 'alice' });

    view.set({ turn: 5, activePlayerId: 'me', activeName: 'me', activeIsMe: true });
    expect(view.text()).toContain('Your turn');
    expect(view.text()).toContain('turn 5');
    expect(view.banner()?.classList.contains('mine')).toBe(true);

    view.wait(TURN_DWELL_MS + 1);
    expect(view.banner()).toBeNull();
  });

  it('drops a phase that has already moved on before it settles', () => {
    const view = render({ turn: 4, activePlayerId: 'p0', activeName: 'alice', phase: 'Beginning' });

    view.set({ turn: 4, activePlayerId: 'p0', activeName: 'alice', phase: 'Precombat Main' });
    view.wait(PHASE_SETTLE_MS - 50);
    expect(view.banner()).toBeNull();

    view.set({ turn: 4, activePlayerId: 'p0', activeName: 'alice', phase: 'Combat' });
    view.wait(PHASE_SETTLE_MS - 50);

    expect(view.banner()).toBeNull();

    view.wait(100);
    expect(view.text()).toContain('Combat');
    expect(view.text()).toContain('alice’s turn');

    view.wait(PHASE_DWELL_MS + 1);
    expect(view.banner()).toBeNull();
  });

  it('does not let a phase cut a turn announcement short', () => {
    const view = render({ turn: 4, activePlayerId: 'p0', activeName: 'alice', phase: 'End' });

    view.set({
      turn: 5,
      activePlayerId: 'me',
      activeName: 'me',
      activeIsMe: true,
      phase: 'Beginning',
    });
    expect(view.text()).toContain('Your turn');

    view.set({
      turn: 5,
      activePlayerId: 'me',
      activeName: 'me',
      activeIsMe: true,
      phase: 'Precombat Main',
    });
    view.wait(PHASE_SETTLE_MS + 50);
    expect(view.text()).toContain('Your turn');
  });

  it('draws a phase more quietly than a turn', () => {
    const view = render({
      turn: 4,
      activePlayerId: 'p0',
      activeName: 'alice',
      phase: 'Precombat Main',
    });

    view.set({ turn: 4, activePlayerId: 'p0', activeName: 'alice', phase: 'Combat' });
    view.wait(PHASE_SETTLE_MS + 1);

    expect(view.banner()?.classList.contains('phase')).toBe(true);
  });
});
