#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CARD_INDEX = resolve(ROOT, 'bridge/src/main/resources/card-index.txt');
const TOKEN_IMAGE_SOURCE = resolve(
  ROOT,
  'vendor/xmage/Mage.Client/src/main/java/org/mage/plugins/card/dl/sources/ScryfallImageSupportTokens.java',
);
const OUT_DIR = resolve(ROOT, 'web/public');
const POINTER_FILE = resolve(OUT_DIR, 'card-images.json');
const TOKEN_POINTER_FILE = resolve(OUT_DIR, 'token-images.json');

const PAYLOAD_NAME = /^card-images\.([0-9a-f]{12})\.json$/;

const TOKEN_PAYLOAD_NAME = /^token-images\.([0-9a-f]{12})\.json$/;

const TOKEN_MAP_ENTRY = /put\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;

const TOKEN_IMAGE_URL =
  /^https:\/\/api\.scryfall\.com\/cards\/([a-zA-Z0-9]+)\/([A-Za-z0-9+]+)\/?(?:en)?\/?\?format=image(?:&face=(front|back))?$/;

const BULK_DATA_LIST = 'https://api.scryfall.com/bulk-data';

const HEADERS = {
  'User-Agent': 'phase-out-card-art/2.0',
  Accept: 'application/json',
};

async function main() {
  const wanted = await readWantedPrintings();
  console.log(`card-index.txt: ${wanted.size} printing(s) to look up`);
  const { byPrinting: tokensByPrinting, entryCount: tokenEntryCount } = await readWantedTokens();
  console.log(`ScryfallImageSupportTokens.java: ${tokenEntryCount} token image(s) to look up`);

  const bulk = await findDefaultCardsBulkFile();
  console.log(
    `default_cards: ${(bulk.compressedSize / 1024 / 1024).toFixed(1)} MB compressed, ` +
      `updated ${bulk.updatedAt}`,
  );
  console.log(`downloading ${bulk.jsonlDownloadUri}`);

  const found = new Map();
  const foundTokens = new Map();
  let scanned = 0;
  for await (const card of streamCards(bulk.jsonlDownloadUri)) {
    scanned++;
    if (scanned % 200000 === 0) process.stdout.write(`\r  scanned ${scanned} card object(s)`);

    const key = printingKey(card.set, card.collector_number);

    if (wanted.has(key) && !found.has(key)) {
      const images = card.image_uris ?? card.card_faces?.[0]?.image_uris;
      const normal = images?.normal;
      const crop = images?.art_crop;
      const artist = card.artist ?? card.card_faces?.[0]?.artist;

      if (normal && crop) found.set(key, artist ? { n: normal, c: crop, a: artist } : { n: normal, c: crop });
    }

    const tokenEntries = tokensByPrinting.get(key);
    if (tokenEntries) {
      for (const { tokenKey, face } of tokenEntries) {
        if (foundTokens.has(tokenKey)) continue;
        const faceIndex = face === 'back' ? 1 : 0;
        const images = card.card_faces?.[faceIndex]?.image_uris ?? card.image_uris;
        const normal = images?.normal;
        const crop = images?.art_crop;
        const artist = card.card_faces?.[faceIndex]?.artist ?? card.artist;
        if (normal && crop) foundTokens.set(tokenKey, artist ? { n: normal, c: crop, a: artist } : { n: normal, c: crop });
      }
    }
  }
  process.stdout.write(`\r  scanned ${scanned} card object(s)\n`);

  const missing = wanted.size - found.size;
  console.log(
    `resolved ${found.size}/${wanted.size} printing(s)` +
      (missing ? ` — ${missing} not on Scryfall (or a set-code mismatch); they render as text tiles` : ''),
  );
  const missingTokens = tokenEntryCount - foundTokens.size;
  console.log(
    `resolved ${foundTokens.size}/${tokenEntryCount} token image(s)` +
      (missingTokens ? ` — ${missingTokens} not on Scryfall (or a broken URL); they render as text tiles` : ''),
  );

  await writePayload(found, OUT_DIR, POINTER_FILE, 'card-images', PAYLOAD_NAME);
  await writePayload(foundTokens, OUT_DIR, TOKEN_POINTER_FILE, 'token-images', TOKEN_PAYLOAD_NAME);
}

async function writePayload(entries, outDir, pointerFile, prefix, payloadNamePattern) {
  const sorted = Object.fromEntries([...entries.keys()].sort().map((key) => [key, entries.get(key)]));
  const body = `${JSON.stringify(sorted)}\n`;
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const payloadName = `${prefix}.${hash}.json`;

  await removeStalePayloads(outDir, payloadName, payloadNamePattern);
  await writeFile(resolve(outDir, payloadName), body);
  await writeFile(pointerFile, `${JSON.stringify({ file: payloadName })}\n`);

  const written = await stat(resolve(outDir, payloadName));
  console.log(`wrote web/public/${payloadName} (${(written.size / 1024 / 1024).toFixed(1)} MB), pointed to by ${prefix}.json`);
}

async function removeStalePayloads(outDir, keep, payloadNamePattern) {
  const entries = await readdir(outDir).catch(() => []);
  for (const name of entries) {
    if (name === keep || !payloadNamePattern.test(name)) continue;
    await unlink(resolve(outDir, name));
  }
}

async function readWantedTokens() {
  const source = await readFile(TOKEN_IMAGE_SOURCE, 'utf8').catch(() => {
    console.error(`${TOKEN_IMAGE_SOURCE} not found — is the vendor/xmage submodule checked out?`);
    process.exit(1);
  });

  const byPrinting = new Map();
  let entryCount = 0;
  let unparsed = 0;
  for (const [, rawKey, url] of source.matchAll(TOKEN_MAP_ENTRY)) {
    const match = TOKEN_IMAGE_URL.exec(url);
    if (!match) {
      unparsed++;
      continue;
    }
    const [, set, number, face] = match;
    const tokenKey = rawKey.toLowerCase();
    const printing = printingKey(set, number);
    const list = byPrinting.get(printing) ?? [];
    list.push({ tokenKey, face });
    byPrinting.set(printing, list);
    entryCount++;
  }
  if (unparsed) console.log(`  (${unparsed} token image URL(s) didn't parse and were skipped)`);
  return { byPrinting, entryCount };
}

async function readWantedPrintings() {
  const text = await readFile(CARD_INDEX, 'utf8').catch(() => {
    console.error(`${CARD_INDEX} not found — run tools/cards/build.mjs first`);
    process.exit(1);
  });
  const wanted = new Set();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const printings = line.split('\t')[1];
    if (!printings) continue;
    for (const token of printings.split(' ')) {
      const separator = token.indexOf(':');
      if (separator <= 0) continue;
      wanted.add(printingKey(token.slice(0, separator), token.slice(separator + 1)));
    }
  }
  return wanted;
}

function printingKey(setCode, cardNumber) {
  return `${setCode.toLowerCase()}/${cardNumber.toLowerCase()}`;
}

async function findDefaultCardsBulkFile() {
  const response = await fetch(BULK_DATA_LIST, { headers: HEADERS });
  if (!response.ok) throw new Error(`GET ${BULK_DATA_LIST}: HTTP ${response.status}`);
  const { data } = await response.json();
  const entry = data.find((item) => item.type === 'default_cards');
  if (!entry) throw new Error('bulk-data listing has no default_cards entry');
  return {
    jsonlDownloadUri: entry.jsonl_download_uri,
    compressedSize: entry.compressed_size,
    updatedAt: entry.updated_at,
  };
}

async function* streamCards(jsonlUrl) {
  const response = await fetch(jsonlUrl, { headers: HEADERS });
  if (!response.ok) throw new Error(`GET ${jsonlUrl}: HTTP ${response.status}`);

  const gunzip = createGunzip();
  Readable.fromWeb(response.body).pipe(gunzip);

  let buffer = '';
  for await (const chunk of gunzip) {
    buffer += chunk.toString('utf8');
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) yield JSON.parse(line);
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}

await main();
