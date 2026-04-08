/**
 * clean-prices.mjs — Detect bad prices in seed.mjs, zero them out, and
 * remove the corresponding entries from data/<site>-prices.json so the next
 * scrape resume re-processes them.
 *
 * Two heuristics:
 *
 *   1. OUTLIER  — if a row has ≥3 filled prices, compute the median; mark
 *      any individual price > 3× median or < 1/3 × median as bad. These are
 *      almost always size mismatches (small sachet matched to bulk bag, etc).
 *
 *   2. DUPLICATE — group rows whose names differ only by size suffix; for
 *      each store column, if every variant in a group has the SAME non-zero
 *      price, set them all to 0 (the store returned its default product
 *      regardless of which size we asked for).
 *
 * Usage: node scripts/clean-prices.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(REPO_ROOT, 'seed.mjs');
const DATA_DIR = path.join(REPO_ROOT, 'data');

const STORE_NAMES = ['jumbo', 'lider', 'tottus', 'unimarc', 'santaisabel'];
const STORE_LABELS = ['Jumbo', 'Lider', 'Tottus', 'Unimarc', 'SI'];

const ROW_RE = /^(  \[)("([^"]+)", "[^"]+", "[^"]+", "[^"]+", \[)(\d+)(, )(\d+)(, )(\d+)(, )(\d+)(, )(\d+)(\]\],?\s*)$/;
const PRICE_GROUPS = [4, 6, 8, 10, 12];

const seedText = fs.readFileSync(SEED_PATH, 'utf8');
const eol = seedText.includes('\r\n') ? '\r\n' : '\n';
const lines = seedText.split(eol);

// Pass 1: parse rows
const rows = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(ROW_RE);
  if (!m) continue;
  rows.push({
    lineIdx: i,
    name: m[3],
    prices: PRICE_GROUPS.map((g) => parseInt(m[g], 10)),
  });
}
console.log('parsed', rows.length, 'product rows');

// Track corrections: row name → set of column indices to clear
const corrections = new Map();
function markBad(name, colIdx) {
  if (!corrections.has(name)) corrections.set(name, new Set());
  corrections.get(name).add(colIdx);
}

// ─── Outlier detection ───
let outlierCount = 0;
for (const row of rows) {
  const filled = row.prices.filter((p) => p > 0);
  if (filled.length < 3) continue;
  const sorted = [...filled].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (let col = 0; col < 5; col++) {
    const p = row.prices[col];
    if (p === 0) continue;
    if (p > median * 3 || p < median / 3) {
      markBad(row.name, col);
      outlierCount++;
    }
  }
}
console.log('outliers found:', outlierCount);

// ─── Duplicate-across-size-variants detection ───
// Group rows by stripping size info from the name
function groupKey(name) {
  return name
    .replace(/\d+(?:[.,]\d+)?\s*(g|kg|ml|l|cc|un|lt)\b/gi, 'X')
    .replace(/talla\s*\w+/gi, 'TALLA')
    .replace(/pack\s*\d+/gi, 'PACK')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const groups = new Map();
for (const row of rows) {
  const k = groupKey(row.name);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(row);
}

let duplicateCount = 0;
for (const group of groups.values()) {
  if (group.length < 2) continue;
  for (let col = 0; col < 5; col++) {
    const prices = group.map((r) => r.prices[col]).filter((p) => p > 0);
    if (prices.length < 2) continue;
    // If all filled prices in this column are identical, they're duplicates
    const unique = new Set(prices);
    if (unique.size === 1 && prices.length === group.length) {
      // Mark all variants in this group/column as bad
      for (const r of group) {
        if (r.prices[col] > 0) {
          if (!corrections.get(r.name)?.has(col)) duplicateCount++;
          markBad(r.name, col);
        }
      }
    }
  }
}
console.log('duplicates found:', duplicateCount);

const totalCorrections = [...corrections.values()].reduce((s, set) => s + set.size, 0);
console.log('total bad prices to clear:', totalCorrections);

if (totalCorrections === 0) {
  console.log('nothing to clean');
  process.exit(0);
}

// ─── Apply corrections to seed.mjs ───
let rewrittenLines = 0;
for (const row of rows) {
  const bad = corrections.get(row.name);
  if (!bad) continue;
  const m = lines[row.lineIdx].match(ROW_RE);
  if (!m) continue;

  const newPrices = PRICE_GROUPS.map((g, idx) => (bad.has(idx) ? '0' : m[g]));
  const rebuilt =
    m[1] +
    m[2] +
    newPrices[0] + ', ' +
    newPrices[1] + ', ' +
    newPrices[2] + ', ' +
    newPrices[3] + ', ' +
    newPrices[4] +
    m[13];
  lines[row.lineIdx] = rebuilt;
  rewrittenLines++;
}

const newText = lines.join(eol);
const tmpPath = SEED_PATH + '.tmp';
fs.writeFileSync(tmpPath, newText);
fs.renameSync(tmpPath, SEED_PATH);
console.log('rewrote', rewrittenLines, 'rows in seed.mjs');

// ─── Clear corresponding entries from data/<site>-prices.json ───
const perSiteRemoved = [0, 0, 0, 0, 0];
for (let col = 1; col < 5; col++) {
  // col 0 = jumbo, never modified
  const slug = STORE_NAMES[col];
  const filePath = path.join(DATA_DIR, `${slug}-prices.json`);
  if (!fs.existsSync(filePath)) continue;
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  for (const [name, badCols] of corrections.entries()) {
    if (!badCols.has(col)) continue;
    if (name in json) {
      delete json[name];
      perSiteRemoved[col]++;
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
}

console.log('\nper-site JSON entries removed (will be re-scraped):');
for (let col = 1; col < 5; col++) {
  console.log(`  ${STORE_LABELS[col].padEnd(10)} ${perSiteRemoved[col]}`);
}

console.log('\nnext: re-run npm run scrape:* to fetch the cleared entries with stricter matching');
