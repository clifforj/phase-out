#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'build/decks');
const SETS_DIR = resolve(ROOT, 'vendor/xmage/Mage.Sets/src/mage/sets');

const DECKS_V2_URL = 'https://raw.githubusercontent.com/taw/magic-preconstructed-decks-data/refs/heads/master/decks_v2.json';

const DECKS = [
  ['Counterpunch', 'cmd', 'counterpunch'],
  ['Devour for Power', 'cmd', 'devour-for-power'],
  ['Heavenly Inferno', 'cmd', 'heavenly-inferno'],
  ['Mirror Mastery', 'cmd', 'mirror-mastery'],
  ['Political Puppets', 'cmd', 'political-puppets'],
  ['Eternal Bargain', 'c13', 'eternal-bargain'],
  ['Evasive Maneuvers', 'c13', 'evasive-maneuvers'],
  ['Mind Seize', 'c13', 'mind-seize'],
  ['Nature of the Beast', 'c13', 'nature-of-the-beast'],
  ['Power Hungry', 'c13', 'power-hungry'],
  ['Built From Scratch', 'c14', 'built-from-scratch'],
  ['Forged In Stone', 'c14', 'forged-in-stone'],
  ['Guided By Nature', 'c14', 'guided-by-nature'],
  ['Peer Through Time', 'c14', 'peer-through-time'],
  ['Sworn To Darkness', 'c14', 'sworn-to-darkness'],
  ['Call the Spirits', 'c15', 'call-the-spirits'],
  ['Plunder the Graves', 'c15', 'plunder-the-graves'],
  ['Seize Control', 'c15', 'seize-control'],
  ['Swell the Host', 'c15', 'swell-the-host'],
  ['Wade into Battle', 'c15', 'wade-into-battle'],
  ['Breed Lethality', 'c16', 'breed-lethality'],
  ['Entropic Uprising', 'c16', 'entropic-uprising'],
  ['Invent Superiority', 'c16', 'invent-superiority'],
  ['Open Hostility', 'c16', 'open-hostility'],
  ['Stalwart Unity', 'c16', 'stalwart-unity'],
  ['Arcane Wizardry', 'c17', 'arcane-wizardry'],
  ['Draconic Domination', 'c17', 'draconic-domination'],
  ['Feline Ferocity', 'c17', 'feline-ferocity'],
  ['Vampiric Bloodlust', 'c17', 'vampiric-bloodlust'],
  ['Adaptive Enchantment', 'c18', 'adaptive-enchantment'],
  ['Exquisite Invention', 'c18', 'exquisite-invention'],
  ["Nature's Vengeance", 'c18', 'natures-vengeance'],
  ['Subjective Reality', 'c18', 'subjective-reality'],
  ['Faceless Menace', 'c19', 'faceless-menace'],
  ['Merciless Rage', 'c19', 'merciless-rage'],
  ['Mystic Intellect', 'c19', 'mystic-intellect'],
  ['Primal Genesis', 'c19', 'primal-genesis'],
  ['Arcane Maelstrom', 'c20', 'arcane-maelstrom'],
  ['Enhanced Evolution', 'c20', 'enhanced-evolution'],
  ['Ruthless Regiment', 'c20', 'ruthless-regiment'],
  ['Symbiotic Swarm', 'c20', 'symbiotic-swarm'],
  ['Timeless Wisdom', 'c20', 'timeless-wisdom'],
  ["Land's Wrath", 'znc', 'lands-wrath'],
  ['Sneak Attack', 'znc', 'sneak-attack'],
  ['Arm for Battle', 'cmr', 'arm-for-battle'],
  ['Reap the Tides', 'cmr', 'reap-the-tides'],
  ['Elven Empire', 'khc', 'elven-empire'],
  ['Phantom Premonition', 'khc', 'phantom-premonition'],
  ['Lorehold Legacies', 'c21', 'lorehold-legacies'],
  ['Prismari Performance', 'c21', 'prismari-performance'],
  ['Quantum Quandrix', 'c21', 'quantum-quandrix'],
  ['Silverquill Statement', 'c21', 'silverquill-statement'],
  ['Witherbloom Witchcraft', 'c21', 'witherbloom-witchcraft'],
  ['Aura of Courage', 'afc', 'aura-of-courage'],
  ['Draconic Rage', 'afc', 'draconic-rage'],
  ['Dungeons of Death', 'afc', 'dungeons-of-death'],
  ['Planar Portal', 'afc', 'planar-portal'],
  ['Coven Counters', 'mic', 'coven-counters'],
  ['Undead Unleashed', 'mic', 'undead-unleashed'],
  ['Spirit Squadron', 'voc', 'spirit-squadron'],
  ['Vampiric Bloodline', 'voc', 'vampiric-bloodline'],
  ['Buckle Up', 'nec', 'buckle-up'],
  ['Upgrades Unleashed', 'nec', 'upgrades-unleashed'],
  ['Bedecked Brokers', 'ncc', 'bedecked-brokers'],
  ['Cabaretti Cacophony', 'ncc', 'cabaretti-cacophony'],
  ['Maestros Massacre', 'ncc', 'maestros-massacre'],
  ['Obscura Operation', 'ncc', 'obscura-operation'],
  ['Riveteers Rampage', 'ncc', 'riveteers-rampage'],
  ['Draconic Dissent', 'clb', 'draconic-dissent'],
  ['Exit from Exile', 'clb', 'exit-from-exile'],
  ['Mind Flayarrrs', 'clb', 'mind-flayarrrs'],
  ['Party Time', 'clb', 'party-time'],
  ["Legends' Legacy", 'dmc', 'legends-legacy'],
  ['Painbow', 'dmc', 'painbow'],
  ['Forces of the Imperium', '40k', 'forces-of-the-imperium'],
  ['Necron Dynasties', '40k', 'necron-dynasties'],
  ['The Ruinous Powers', '40k', 'the-ruinous-powers'],
  ['Tyranid Swarm', '40k', 'tyranid-swarm'],
  ["Mishra's Burnished Banner", 'brc', 'mishras-burnished-banner'],
  ["Urza's Iron Alliance", 'brc', 'urzas-iron-alliance'],
  ['Chaos Incarnate', 'scd', 'chaos-incarnate'],
  ['Draconic Destruction', 'scd', 'draconic-destruction'],
  ['First Flight', 'scd', 'first-flight'],
  ['Grave Danger', 'scd', 'grave-danger'],
  ['Token Triumph', 'scd', 'token-triumph'],
  ['Corrupting Influence', 'onc', 'corrupting-influence'],
  ['Rebellion Rising', 'onc', 'rebellion-rising'],
  ['Elven Council', 'ltc', 'elven-council'],
  ['Riders of Rohan', 'ltc', 'riders-of-rohan'],
  ['The Hosts of Mordor', 'ltc', 'the-hosts-of-mordor'],
  ['Eldrazi Unbound', 'cmm', 'eldrazi-unbound'],
  ['Enduring Enchantments', 'cmm', 'enduring-enchantments'],
  ['Planeswalker Party', 'cmm', 'planeswalker-party'],
  ['Sliver Swarm', 'cmm', 'sliver-swarm'],
  ['Fae Dominion', 'woc', 'fae-dominion'],
  ['Virtue and Valor', 'woc', 'virtue-and-valor'],
  ['Masters of Evil', 'who', 'masters-of-evil'],
  ['Ahoy Mateys', 'lcc', 'ahoy-mateys'],
  ['Blood Rites', 'lcc', 'blood-rites'],
  ['Explorers of the Deep', 'lcc', 'explorers-of-the-deep'],
  ['Veloci-Ramp-Tor', 'lcc', 'veloci-ramp-tor'],
  ['Hail, Caesar', 'pip', 'hail-caesar'],
  ['Mutant Menace', 'pip', 'mutant-menace'],
  ['Science!', 'pip', 'science'],
  ['Scrappy Survivors', 'pip', 'scrappy-survivors'],
  ['Desert Bloom', 'otc', 'desert-bloom'],
  ['Grand Larceny', 'otc', 'grand-larceny'],
  ['Most Wanted', 'otc', 'most-wanted'],
  ['Quick Draw', 'otc', 'quick-draw'],
  ['Creative Energy', 'm3c', 'creative-energy'],
  ['Eldrazi Incursion', 'm3c', 'eldrazi-incursion'],
  ['Graveyard Overdrive', 'm3c', 'graveyard-overdrive'],
  ['Animated Army', 'blc', 'animated-army'],
  ['Peace Offering', 'blc', 'peace-offering'],
  ['Squirreled Away', 'blc', 'squirreled-away'],
  ['Endless Punishment', 'dsc', 'endless-punishment'],
  ['Jump Scare!', 'dsc', 'jump-scare'],
  ['Eternal Might', 'drc', 'eternal-might'],
  ['Living Energy', 'drc', 'living-energy'],
  ['Abzan Armor', 'tdc', 'abzan-armor'],
  ['Jeskai Striker', 'tdc', 'jeskai-striker'],
  ['Mardu Surge', 'tdc', 'mardu-surge'],
  ['Sultai Arisen', 'tdc', 'sultai-arisen'],
  ['Temur Roar', 'tdc', 'temur-roar'],
  ['Counter Blitz (FINAL FANTASY X)', 'fic', 'counter-blitz'],
  ['Limit Break (FINAL FANTASY VII)', 'fic', 'limit-break'],
  ['Revival Trance (FINAL FANTASY VI)', 'fic', 'revival-trance'],
  ['Scions & Spellcraft (FINAL FANTASY XIV)', 'fic', 'scions-and-spellcraft'],
  ['Counter Intelligence', 'eoc', 'counter-intelligence'],
  ['World Shaper', 'eoc', 'world-shaper'],
  ['Blight Curse', 'ecc', 'blight-curse'],

];

const COMMANDER_DECK_SIZE = 100;

async function main() {
  const check = process.argv.includes('--check');
  const setFiles = mapSetCodesToFiles();
  const decksV2 = await fetchDecksV2();

  const problems = [];
  const summaries = [];
  const printingsCache = new Map();
  const releaseDateCache = new Map();

  for (const [name, setCode, slug] of DECKS) {
    const source = decksV2.find(
      (d) => d.type === 'Commander Deck' && d.name === name && d.set_code === setCode,
    );
    if (!source) {
      problems.push(`${slug}: no "${name}" [${setCode}] Commander Deck in decks_v2.json`);
      continue;
    }

    const released = releaseDateFor(setCode, setFiles, releaseDateCache);
    if (!released) {
      problems.push(`${slug}: no release date for set [${setCode}] in vendor/xmage`);
    }

    const cards = [

      ...[...source.cards].sort((a, b) => a.name.localeCompare(b.name)).map((card) => ({ card, sideboard: false })),

      ...source.commander.map((card) => ({ card, sideboard: true })),
    ];

    const lines = [`NAME:${source.name}`, `RELEASED:${released ?? '0000-00-00'}`];
    for (const { card, sideboard } of cards) {
      const printings = printingsFor(card.set_code, setFiles, printingsCache);
      if (printings === null) {
        problems.push(`${slug}: no xmage set for ${card.set_code} (${card.name})`);
        continue;
      }

      const raw = String(card.number);
      const baseNumber = raw.match(/^\d+/)?.[0] ?? raw;
      const number = printings.has(raw) ? raw : baseNumber;
      const xmageName = printings.get(number);
      if (!xmageName) {
        problems.push(`${slug}: [${card.set_code.toUpperCase()}:${raw}] ${card.name} — XMage has no such printing`);
        continue;
      }

      lines.push(`${sideboard ? 'SB: ' : ''}${card.count} [${card.set_code.toUpperCase()}:${number}] ${xmageName}`);
    }

    const total = cards.reduce((sum, { card }) => sum + card.count, 0);
    if (total !== COMMANDER_DECK_SIZE) {
      problems.push(`${slug}: ${total} cards, not ${COMMANDER_DECK_SIZE} — would be refused at join time`);
    }
    if (source.commander.length !== 1) {
      problems.push(`${slug}: ${source.commander.length} commanders`);
    }

    summaries.push({ slug, name: source.name, total, commander: source.commander.map((c) => c.name).join(' / ') });
    if (!check) await writeFile(resolve(OUT_DIR, `${slug}.dck`), `${lines.join('\n')}\n`);
  }

  for (const { slug, name, total, commander } of summaries) {
    console.log(`${slug}.dck — ${name}, ${total} cards, commander ${commander}`);
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);

    process.exit(1);
  }
  console.log(check ? '\nall printings resolve against the pinned submodule' : `\nwrote ${DECKS.length} deck(s) to build/decks/`);
}

function releaseDateFor(setCode, setFiles, cache) {
  const upper = setCode.toUpperCase();
  if (cache.has(upper)) return cache.get(upper);
  const file = setFiles[upper];
  const source = file ? readFileSync(resolve(SETS_DIR, file), 'utf8') : null;
  const match = source?.match(/ExpansionSet\.buildDate\((\d+),\s*(\d+),\s*(\d+)\)/);
  const date = match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
  cache.set(upper, date);
  return date;
}

function printingsFor(setCode, setFiles, cache) {
  const upper = setCode.toUpperCase();
  if (cache.has(upper)) return cache.get(upper);
  const file = setFiles[upper];
  const printings = file ? readPrintings(file) : null;
  cache.set(upper, printings);
  return printings;
}

const UNFINISHED_LIST = /\bunfinished\s*=\s*Arrays\.asList\(([^)]*)\)/;
const REMOVE_UNFINISHED = /cards\.removeIf\(\s*setCardInfo\s*->\s*unfinished\.contains\(setCardInfo\.getName\(\)\)\s*\)/;

function unfinishedNames(source) {
  if (!REMOVE_UNFINISHED.test(source)) return new Set();
  const list = UNFINISHED_LIST.exec(source);
  if (!list) return new Set();
  return new Set([...list[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"')));
}

function readPrintings(file) {
  const source = readFileSync(resolve(SETS_DIR, file), 'utf8');
  const unfinished = unfinishedNames(source);
  const printings = new Map();
  for (const match of source.matchAll(/new SetCardInfo\("((?:[^"\\]|\\.)*)",\s*(\d+)/g)) {
    const name = match[1].replace(/\\"/g, '"');
    if (unfinished.has(name)) continue;
    printings.set(match[2], name);
  }
  return printings;
}

function mapSetCodesToFiles() {
  const files = readdirSync(SETS_DIR).filter((f) => f.endsWith('.java'));
  if (files.length === 0) {
    console.error(`no set classes in ${SETS_DIR} — is the vendor/xmage submodule checked out?`);
    process.exit(1);
  }
  const map = {};
  for (const file of files) {
    const source = readFileSync(resolve(SETS_DIR, file), 'utf8');
    const match = source.match(/super\(\s*"(?:[^"\\]|\\.)*"\s*,\s*"([A-Za-z0-9]+)"/s);
    if (match) map[match[1]] = file;
  }
  return map;
}

async function fetchDecksV2() {
  const response = await fetch(DECKS_V2_URL, { headers: { 'User-Agent': 'phase-out-decks/1.0' } });
  if (!response.ok) throw new Error(`${DECKS_V2_URL}: HTTP ${response.status}`);
  return response.json();
}

await mkdir(OUT_DIR, { recursive: true });
await main();
