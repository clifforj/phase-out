import type { Chat } from './protocol';

export interface LogLine {
  id: number;

  kind: 'GAME' | 'STATUS';

  text: string;

  turnInfo?: string;

  objectIds: string[];

  repeats: number;
}

const LOG_TYPES = new Set(['GAME', 'STATUS']);

export function isLogMessage(frame: Chat): boolean {
  return LOG_TYPES.has(frame.messageType ?? '');
}

export function toLogLine(frame: Chat, id: number): LogLine {
  const raw = frame.text ?? '';
  const objectIds = [...raw.matchAll(/object_id='([0-9a-fA-F-]{36})'/g)].map((m) => m[1]);
  const from = frame.from?.trim();
  const text = stripMarkup(raw);
  return {
    id,
    kind: frame.messageType === 'STATUS' ? 'STATUS' : 'GAME',

    text: from && frame.messageType === 'STATUS' ? `${from} ${text}` : text,
    turnInfo: frame.turnInfo?.trim() || undefined,
    objectIds,
    repeats: 1,
  };
}

export function appendLogLine(lines: LogLine[], line: LogLine, limit: number): LogLine[] {
  const last = lines[lines.length - 1];
  if (
    last &&
    last.kind === line.kind &&
    last.text === line.text &&
    last.turnInfo === line.turnInfo
  ) {
    const collapsed = lines.slice();
    collapsed[collapsed.length - 1] = { ...last, repeats: last.repeats + 1 };
    return collapsed;
  }
  const next = lines.length >= limit ? lines.slice(lines.length - limit + 1) : lines.slice();
  next.push(line);
  return next;
}

export function withoutTags(text: string): string {
  return text.replace(/\s*\[[0-9a-f]{3}\]/gi, '').trim();
}

export function stripMarkup(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
