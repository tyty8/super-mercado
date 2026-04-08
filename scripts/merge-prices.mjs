/**
 * merge-prices.mjs — Merge data/<site>-prices.json into seed.mjs in place.
 *
 * Rewrites only the target site's column when the seed has 0 there and the
 * scraped JSON has a numeric price for that product name. Preserves all other
 * characters (including line endings, comments, and category headers).
 *
 * Usage:
 *   node scripts/merge-prices.mjs --site lider
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(REPO_ROOT, 'seed.mjs');
const DATA_DIR = path.join(REPO_ROOT, 'data');

function parseArgs(argv) {
  const args = { site: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--site') args.site = argv[++i];
  }
  if (!args.site) {
    console.error('error: --site <name> is required');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const adapterPath = path.join(__dirname, 'adapters', `${args.site}.mjs`);
if (!fs.existsSync(adapterPath)) {
  console.error(`error: no adapter at ${adapterPath}`);
  process.exit(2);
}
const adapter = (await import('file://' + adapterPath.replace(/\\/g, '/'))).default;

const PRICES_PATH = path.join(DATA_DIR, `${adapter.slug}-prices.json`);
if (!fs.existsSync(PRICES_PATH)) {
  console.error(`error: no scraped prices at ${PRICES_PATH}`);
  console.error(`run: node scripts/scrape.mjs --site ${adapter.slug}`);
  process.exit(2);
}
const prices = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf8'));

// Match seed rows. Capture: name, brand, cat, unit, p0..p4. Use the same regex
// shape that scrape.mjs verified earlier — anchored at the canonical 2-space
// indent, allowing optional trailing comma + whitespace.
const ROW_RE = /^(  \[)("([^"]+)", "[^"]+", "[^"]+", "[^"]+", \[)(\d+)(, )(\d+)(, )(\d+)(, )(\d+)(, )(\d+)(\]\],?\s*)$/;

const seedText = fs.readFileSync(SEED_PATH, 'utf8');

// Preserve line endings exactly. Detect dominant ending and split accordingly.
const eol = seedText.includes('\r\n') ? '\r\n' : '\n';
const lines = seedText.split(eol);

let matched = 0;
let unmatched = 0;
let nullSkipped = 0;
let alreadyFilled = 0;

const PRICE_GROUPS = [4, 6, 8, 10, 12]; // capture group indices for p0..p4 in ROW_RE

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(ROW_RE);
  if (!m) continue;

  const name = m[3];
  const scraped = prices[name];

  if (scraped == null) {
    if (name in prices) nullSkipped++;
    else unmatched++;
    continue;
  }
  if (typeof scraped !== 'number' || !Number.isFinite(scraped) || scraped <= 0) {
    nullSkipped++;
    continue;
  }

  const currentVal = parseInt(m[PRICE_GROUPS[adapter.colIndex]], 10);
  if (currentVal !== 0) {
    alreadyFilled++;
    continue;
  }

  // Rebuild the line with the new price at adapter.colIndex.
  const newPrices = PRICE_GROUPS.map((g, idx) =>
    idx === adapter.colIndex ? String(scraped) : m[g]
  );
  const rebuilt =
    m[1] + // "  ["
    m[2] + // "name", "brand", "cat", "unit", ["
    newPrices[0] + ', ' +
    newPrices[1] + ', ' +
    newPrices[2] + ', ' +
    newPrices[3] + ', ' +
    newPrices[4] +
    m[13]; // "]],<optional comma + ws>"

  lines[i] = rebuilt;
  matched++;
}

const newText = lines.join(eol);
const tmpPath = SEED_PATH + '.tmp';
fs.writeFileSync(tmpPath, newText);
fs.renameSync(tmpPath, SEED_PATH);

console.log(`✅ merged ${adapter.slug} prices into seed.mjs`);
console.log(`   matched (rewritten): ${matched}`);
console.log(`   unmatched (no entry in JSON): ${unmatched}`);
console.log(`   null skipped (JSON had null/0): ${nullSkipped}`);
console.log(`   already filled (col already non-zero): ${alreadyFilled}`);
