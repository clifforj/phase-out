export type TurnStopId =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'main1'
  | 'combat'
  | 'attackers'
  | 'blockers'
  | 'damage'
  | 'main2'
  | 'end';

export type TurnGroupId = 'beginning' | 'main1' | 'combat' | 'main2' | 'end';

export interface TurnStop {
  id: TurnStopId;

  label: string;
  group: TurnGroupId;

  opensGroup: boolean;

  major: boolean;
}

const MAJOR_STOPS: ReadonlySet<TurnStopId> = new Set<TurnStopId>([
  'main1',
  'attackers',
  'blockers',
  'main2',
]);

export const NO_STOP = -1;

export const TURN_STOPS: readonly TurnStop[] = (
  [
    { id: 'untap', label: 'Untap', group: 'beginning', opensGroup: true },
    { id: 'upkeep', label: 'Upkeep', group: 'beginning', opensGroup: false },
    { id: 'draw', label: 'Draw', group: 'beginning', opensGroup: false },
    { id: 'main1', label: 'First main phase', group: 'main1', opensGroup: true },
    { id: 'combat', label: 'Beginning of combat', group: 'combat', opensGroup: true },
    { id: 'attackers', label: 'Declare attackers', group: 'combat', opensGroup: false },
    { id: 'blockers', label: 'Declare blockers', group: 'combat', opensGroup: false },
    { id: 'damage', label: 'Combat damage', group: 'combat', opensGroup: false },
    { id: 'main2', label: 'Second main phase', group: 'main2', opensGroup: true },
    { id: 'end', label: 'End of turn', group: 'end', opensGroup: true },
  ] satisfies Omit<TurnStop, 'major'>[]
).map((stop) => ({ ...stop, major: MAJOR_STOPS.has(stop.id) }));

const STEP_STOPS = new Map<string, TurnStopId>([
  ['untap', 'untap'],
  ['upkeep', 'upkeep'],
  ['draw', 'draw'],
  ['precombat main', 'main1'],
  ['begin combat', 'combat'],
  ['declare attackers', 'attackers'],
  ['declare blockers', 'blockers'],
  ['first combat damage', 'damage'],
  ['combat damage', 'damage'],
  ['end combat', 'damage'],
  ['postcombat main', 'main2'],
  ['end turn', 'end'],
  ['cleanup', 'end'],
]);

export function turnStopIndex(step: string | null | undefined): number {
  if (!step) return NO_STOP;
  const key = step.trim().toLowerCase().replace(/\s+/g, ' ');
  const id = STEP_STOPS.get(key);
  if (!id) return NO_STOP;
  return TURN_STOPS.findIndex((stop) => stop.id === id);
}

export function sameTurnText(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function turnProgress(index: number): number {
  if (index < 0) return 0;
  return (index + 0.5) / TURN_STOPS.length;
}
