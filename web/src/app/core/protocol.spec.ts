import { Hello, TableSummary, authModeOf, isWatchable, unwatchableReason } from './protocol';

function table(overrides: Partial<TableSummary> = {}): TableSummary {
  return {
    tableId: 't1',
    name: 'watch me',
    controllerName: 'alice',
    gameType: 'Commander Two Player Duel',
    deckType: 'Variant Magic - Commander',
    state: 'Dueling',
    stateCode: 'DUELING',
    seatsInfo: '2/2',
    isTournament: false,
    passworded: false,
    seats: [],
    gameIds: [],
    ...overrides,
  };
}

const ALL_STATE_CODES = [
  'WAITING',
  'READY_TO_START',
  'STARTING',
  'DRAFTING',
  'CONSTRUCTING',
  'DUELING',
  'SIDEBOARDING',
  'FINISHED',
];

describe('auth mode', () => {
  const hello = (authMode?: Hello['authMode']): Hello => ({
    type: 'hello',
    protocolVersion: 1,
    bridgeSessionId: 's',
    xmageServerHost: 'h',
    xmageServerPort: 1,
    ...(authMode ? { authMode } : {}),
  });

  it('reads a hello with no authMode as off', () => {
    expect(authModeOf(hello())).toBe('off');
    expect(authModeOf(hello('off'))).toBe('off');
    expect(authModeOf(hello('required'))).toBe('required');
  });
});

describe('watchability', () => {
  it('is true for DUELING and nothing else', () => {
    for (const stateCode of ALL_STATE_CODES) {
      expect(isWatchable(table({ stateCode }))).toBe(stateCode === 'DUELING');
    }
  });

  it('ignores the display text entirely', () => {
    expect(isWatchable(table({ state: 'Dueling', stateCode: 'STARTING' }))).toBe(false);
    expect(isWatchable(table({ state: 'anything at all', stateCode: 'DUELING' }))).toBe(true);
  });

  it('explains itself when a table cannot be watched', () => {
    expect(unwatchableReason(table())).toBe('');
    expect(
      unwatchableReason(table({ stateCode: 'WAITING', state: 'Waiting for players' })),
    ).toContain('dueling');
    expect(unwatchableReason(table({ stateCode: 'FINISHED', state: 'Finished' }))).toContain(
      'finished',
    );
    expect(
      unwatchableReason(table({ stateCode: 'STARTING', isTournament: true, state: 'Starting' })),
    ).toContain('Tournaments');
  });
});
