import { type LogLine, withoutTags } from '../core/game-log';

export type GameEventKind =
  'ending' | 'removal' | 'damage' | 'life' | 'trigger' | 'combat' | 'cast' | 'resolve' | 'other';

export interface GameEvent {
  id: number;
  kind: GameEventKind;

  text: string;
  repeats: number;

  objectIds: readonly string[];
}

const ROUTINE: readonly RegExp[] = [
  /^TURN \d+ for /i,
  /^Match score:/i,
  /^Game has started/i,
  /\bskip attack$/i,
  /\bskips \w+ (step|phase)\b/i,
  /\bdraws (a card|[a-z]+ cards?)\b/i,
  /\blibrary is shuffled\b/i,
  /\bshuffles .* into their library\b/i,
  /\bwon the toss\b/i,
  /\bchooses that they take the \w+ turn\b/i,
  /\bkeeps hand\b/i,
  /\bmulligans\b/i,

  /\bputs .* from hand onto the Battlefield\b/i,
  /\bdiscards down to \d+ hand cards?\b/i,
  /\b(paid|did not pay) for\b/i,
  /\bannounces a value of\b/i,

  /^(Attacker|Blocker):/i,
];

const QUOTES_RULES = /- ability triggers:|\bactivates:/i;

export const GLANCE_KINDS: ReadonlySet<GameEventKind> = new Set<GameEventKind>([
  'ending',
  'removal',
  'damage',
]);

export function gameEvent(line: LogLine): GameEvent | null {
  if (line.kind !== 'GAME') return null;
  const text = withoutTags(line.text);
  if (!text) return null;
  if (!QUOTES_RULES.test(text) && ROUTINE.some((pattern) => pattern.test(text))) return null;
  return {
    id: line.id,
    kind: classify(text),
    text,
    repeats: line.repeats,
    objectIds: line.objectIds,
  };
}

export function gameEvents(lines: readonly LogLine[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const line of lines) {
    const event = gameEvent(line);
    if (event) events.push(event);
  }
  return events;
}

function classify(text: string): GameEventKind {
  const line = text.toLowerCase();

  if (/- ability triggers:|\btriggered ability\b/.test(line)) return 'trigger';
  if (/\bactivates:/.test(line)) return 'cast';

  if (
    /\b(has won the game|has lost the game|lost the game due|the game is a draw|quits the match)\b/.test(
      line,
    )
  ) {
    return 'ending';
  }

  if (
    /\b(was destroyed|died|sacrificed|is put into graveyard from battlefield|has been fizzled|is countered by|exiles)\b/.test(
      line,
    )
  ) {
    return 'removal';
  }

  if (
    /\b(deals \d+ damage|gets \d+ damage|loses \d+ life|damage .*(was|were) prevented)\b/.test(line)
  ) {
    return 'damage';
  }

  if (/\bgains \d+ life\b/.test(line)) return 'life';

  if (/\b(attacks|blocks)\b/.test(line)) return 'combat';

  if (/\b(casts|plays)\b/.test(line)) return 'cast';

  if (/\bfrom stack (onto|into)\b|\bcreates a .*\btoken\b|\benters\b/.test(line)) return 'resolve';

  return 'other';
}
