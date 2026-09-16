import type { ServerFrame } from '../core/protocol';

export interface RecordedLine {
  at: number;
  frame: ServerFrame;
}

export const FIXTURES = {
  spectatorDuel: 'spectator-duel',

  playerVsAi: 'player-vs-ai',
} as const;

export type FixtureName = (typeof FIXTURES)[keyof typeof FIXTURES];

export function parseFixture(text: string): RecordedLine[] {
  return text
    .split('\n')
    .filter((line) => line.trim().length)
    .map((line) => JSON.parse(line) as RecordedLine);
}
