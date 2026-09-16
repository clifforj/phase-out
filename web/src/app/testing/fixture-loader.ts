import { readFileSync, readdirSync } from 'node:fs';
import { RecordedLine, parseFixture } from './fixture';

const FIXTURE_DIR = 'src/app/testing/fixtures';

export function loadFixture(name: string): RecordedLine[] {
  return parseFixture(readFileSync(`${FIXTURE_DIR}/${name}.ndjson`, 'utf8'));
}

export function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.ndjson'))
    .map((file) => file.slice(0, -'.ndjson'.length))
    .sort();
}
