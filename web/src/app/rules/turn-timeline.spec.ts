import { NO_STOP, TURN_STOPS, turnProgress, turnStopIndex } from './turn-timeline';

const XMAGE_PHASE_STEPS = [
  'Untap',
  'Upkeep',
  'Draw',
  'Precombat Main',
  'Begin Combat',
  'Declare Attackers',
  'Declare Blockers',
  'First Combat Damage',
  'Combat Damage',
  'End Combat',
  'Postcombat Main',
  'End Turn',
  'Cleanup',
];

describe('turnStopIndex', () => {
  it('places every one of XMage’s own thirteen steps', () => {
    for (const step of XMAGE_PHASE_STEPS) {
      expect(
        turnStopIndex(step),
        `${step} has no stop — has vendor/xmage's PhaseStep changed?`,
      ).not.toBe(NO_STOP);
    }
  });

  it('advances monotonically through the turn', () => {
    const indices = XMAGE_PHASE_STEPS.map(turnStopIndex);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i], `${XMAGE_PHASE_STEPS[i]} goes backwards`).toBeGreaterThanOrEqual(
        indices[i - 1],
      );
    }

    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(TURN_STOPS.length - 1);
  });

  it('shares one stop between the steps a player reads as one moment', () => {
    const damage = ['First Combat Damage', 'Combat Damage', 'End Combat'].map(turnStopIndex);
    expect(new Set(damage).size).toBe(1);
    expect(TURN_STOPS[damage[0]].id).toBe('damage');

    const end = ['End Turn', 'Cleanup'].map(turnStopIndex);
    expect(new Set(end).size).toBe(1);
    expect(TURN_STOPS[end[0]].id).toBe('end');
  });

  it('marks the two mains and the two combat declarations as the turn’s landmarks, and nothing else', () => {
    const major = TURN_STOPS.filter((stop) => stop.major).map((stop) => stop.id);
    expect(major).toEqual(['main1', 'attackers', 'blockers', 'main2']);
  });

  it('tolerates the cheap kinds of drift in prose that is not a contract', () => {
    expect(turnStopIndex('declare attackers')).toBe(turnStopIndex('Declare Attackers'));
    expect(turnStopIndex('  Declare   Attackers ')).toBe(turnStopIndex('Declare Attackers'));
  });

  it('refuses to guess at a step it does not know', () => {
    expect(turnStopIndex('Second Main')).toBe(NO_STOP);
    expect(turnStopIndex('')).toBe(NO_STOP);
    expect(turnStopIndex(null)).toBe(NO_STOP);
    expect(turnStopIndex(undefined)).toBe(NO_STOP);
  });
});

describe('turnProgress', () => {
  it('never reads as finished while a step is still open', () => {
    const last = turnProgress(TURN_STOPS.length - 1);
    expect(last).toBeGreaterThan(0.9);
    expect(last).toBeLessThan(1);
  });

  it('rises with the turn, and is empty for a step it could not place', () => {
    const values = TURN_STOPS.map((_, index) => turnProgress(index));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    expect(turnProgress(NO_STOP)).toBe(0);
  });
});
