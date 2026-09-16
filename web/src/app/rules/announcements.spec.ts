import { announcementFor, type TurnSignal } from './announcements';

function signal(overrides: Partial<TurnSignal> = {}): TurnSignal {
  return {
    turn: 1,
    activePlayerId: 'p0',
    activeName: 'alice',
    activeIsMe: false,
    phase: 'Precombat Main',
    ...overrides,
  };
}

describe('announcementFor', () => {
  it('says nothing without a frame to compare against', () => {
    expect(announcementFor(null, signal())).toBeNull();
  });

  it('says nothing when nothing about the turn moved', () => {
    expect(announcementFor(signal(), signal())).toBeNull();
  });

  it('announces the turn passing to somebody else, by name', () => {
    const announcement = announcementFor(
      signal({ turn: 4, activePlayerId: 'p0', activeName: 'alice' }),
      signal({ turn: 5, activePlayerId: 'p1', activeName: 'bob' }),
    );

    expect(announcement).toEqual({
      kind: 'turn',
      text: 'bob’s turn',
      detail: 'turn 5',
      mine: false,
    });
  });

  it('announces your own turn as yours', () => {
    const announcement = announcementFor(
      signal({ turn: 4, activePlayerId: 'p1' }),
      signal({ turn: 5, activePlayerId: 'me', activeName: 'me', activeIsMe: true }),
    );

    expect(announcement?.text).toBe('Your turn');
    expect(announcement?.mine).toBe(true);
  });

  it('announces a turn that passes back to the same player', () => {
    const announcement = announcementFor(signal({ turn: 5 }), signal({ turn: 6 }));
    expect(announcement?.kind).toBe('turn');
    expect(announcement?.detail).toBe('turn 6');
  });

  it('announces a phase change within a turn, and says whose turn it is', () => {
    const announcement = announcementFor(
      signal({ phase: 'Precombat Main' }),
      signal({ phase: 'Combat' }),
    );

    expect(announcement).toEqual({
      kind: 'phase',
      text: 'Combat',
      detail: 'alice’s turn',
      mine: false,
    });
  });

  it('prefers the turn when the turn and the phase move together', () => {
    const announcement = announcementFor(
      signal({ turn: 5, activePlayerId: 'p0', phase: 'End' }),
      signal({ turn: 6, activePlayerId: 'p1', activeName: 'bob', phase: 'Beginning' }),
    );

    expect(announcement?.kind).toBe('turn');
  });

  it('says nothing about a phase the frame did not carry', () => {
    expect(announcementFor(signal({ phase: 'Combat' }), signal({ phase: null }))).toBeNull();
  });
});
