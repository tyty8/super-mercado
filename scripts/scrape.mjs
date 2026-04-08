/**
 * scrape.mjs — CDP-attached scraper for filling missing prices in seed.mjs.
 *
 * Prereqs:
 *   1. Launch Chrome locally with remote debugging:
 *        chrome --remote-debugging-port=9222 --user-data-dir=/tmp/scrape-profile
 *   2. In that Chrome, visit the target site once and clear any anti-bot challenge.
 *   3. Then run this script.
 *
 * Usage:
 *   node scripts/scrape.mjs --site lider
 *   node scripts/scrape.mjs --site tottus --limit 5
 *   node scripts/scrape.mjs --site unimarc --start 100
 *   node scripts/scrape.mjs --site santaisabel --port 9222 --query-mode brand-name
 *
 * Output: data/<site>-prices.json — { "<seed product name>": <price int|null>, ... }
 *         Rewritten after every product, so the run is resumable on crash/SIGINT.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(REPO_ROOT, 'seed.mjs');
const DATA_DIR = path.join(REPO_ROOT, 'data');

// ─── CLI parsing ───
function parseArgs(argv) {
  const args = { site: null, limit: Infinity, start: 0, port: 9222, queryMode: 'brand-name' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--site') args.site = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--start') args.start = parseInt(argv[++i], 10);
    else if (a === '--port') args.port = parseInt(argv[++i], 10);
    else if (a === '--query-mode') args.queryMode = argv[++i];
  }
  if (!args.site) {
    console.error('error: --site <lider|tottus|unimarc|santaisabel> is required');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

// ─── Load adapter ───
const adapterPath = path.join(__dirname, 'adapters', `${args.site}.mjs`);
if (!fs.existsSync(adapterPath)) {
  console.error(`error: no adapter at ${adapterPath}`);
  process.exit(2);
}
const adapter = (await import('file://' + adapterPath.replace(/\\/g, '/'))).default;

// ─── Read seed.mjs and extract product rows ───
const ROW_RE = /^  \["([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)", \[(\d+), (\d+), (\d+), (\d+), (\d+)\]\],?\s*$/;

function loadMissing(colIndex) {
  const text = fs.readFileSync(SEED_PATH, 'utf8');
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const m = line.match(ROW_RE);
    if (!m) continue;
    const prices = [m[5], m[6], m[7], m[8], m[9]].map((s) => parseInt(s, 10));
    if (prices[colIndex] !== 0) continue;
    rows.push({ name: m[1], brand: m[2], category: m[3], unit: m[4], prices });
  }
  return rows;
}

// ─── Output JSON cache ───
fs.mkdirSync(DATA_DIR, { recursive: true });
const OUT_PATH = path.join(DATA_DIR, `${adapter.slug}-prices.json`);
let results = {};
if (fs.existsSync(OUT_PATH)) {
  try { results = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch { results = {}; }
}

function saveResults() {
  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
}

// ─── Query builder ───
// Generic packaging/format words that don't help search relevance.
const STOPWORDS = new Set([
  'pack', 'cu', 'un', 'unidad', 'unidades', 'doypack', 'frasco', 'sachet',
  'botella', 'bolsa', 'caja', 'lata', 'tarro', 'envase', 'pote',
  'spray', 'stick', 'barra', 'roll', 'crema', 'gel', 'liquido', 'liquida',
  'desodorante', 'antitranspirante', 'shampoo', 'acondicionador',
  'detergente', 'papel', 'higienico', 'aceite', 'leche', 'queso',
  // size unit words
  'kg', 'gr', 'ml', 'lt',
]);

function tokensForQuery(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
}

// Extract size terms suitable for inclusion in a search query
// (e.g. "45 g", "1.5 L", "talla G").
function extractSizeQueryTerms(name) {
  const terms = [];
  const m1 = name.match(/(\d+(?:[.,]\d+)?\s*(?:g|kg|gr|ml|l|lt|cc|un)\b)/i);
  if (m1) terms.push(m1[1]);
  const m2 = name.match(/(talla\s+(?:prematuro|rn|p|m|g|xg|xxg|xxxg)\b)/i);
  if (m2) terms.push(m2[1]);
  return terms.join(' ');
}

function buildQuery(row) {
  // Default ("full") cap at 60 chars — still useful when queries are short.
  if (args.queryMode === 'full') {
    return row.name.slice(0, 60);
  }
  // brand-name: brand + up to 3 distinctive tokens from the name + size info
  // (excluding the brand itself and generic packaging/format stopwords).
  // Including size info helps stores like Lider/Tottus return the right
  // variant instead of a default one.
  const brandTokens = new Set(tokensForQuery(row.brand));
  const distinct = tokensForQuery(row.name).filter((t) => !brandTokens.has(t));
  const tail = distinct.slice(0, 3).join(' ');
  const size = extractSizeQueryTerms(row.name);
  return `${row.brand} ${tail} ${size}`.trim().replace(/\s+/g, ' ').slice(0, 60);
}

// ─── Soft name match ───
function tokenize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

// Extract normalized size signatures (e.g. "45g", "1500ml", "12un", "tallag")
// from a product name. Used to enforce that the search result has the SAME
// size as the seed product — without this, "Pañal Talla G" matches the store's
// default "Pañal Talla M" because brand+name tokens overlap.
function extractSizes(name) {
  const sizes = [];
  const lc = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Numeric size with unit: 45 g, 1.5 L, 1500 ml, 12 un.
  const re = /(\d+(?:[.,]\d+)?)\s*(g|kg|gr|ml|l|lt|cc|un)\b/gi;
  let m;
  while ((m = re.exec(lc)) !== null) {
    let val = parseFloat(m[1].replace(',', '.'));
    let unit = m[2];
    if (unit === 'kg') { val *= 1000; unit = 'g'; }
    else if (unit === 'gr') { unit = 'g'; }
    else if (unit === 'l' || unit === 'lt') { val *= 1000; unit = 'ml'; }
    else if (unit === 'cc') { unit = 'ml'; }
    sizes.push(Math.round(val) + unit);
  }

  // Pañales sizes: "Talla G", "Talla XXG", etc.
  const tm = lc.match(/talla\s+(prematuro|rn|p|m|g|xg|xxg|xxxg)\b/);
  if (tm) sizes.push('talla' + tm[1]);

  return sizes;
}

function sizesCompatible(seedSizes, foundSizes) {
  if (seedSizes.length === 0) return true; // seed has no size info → can't enforce
  if (foundSizes.length === 0) return false; // seed has size, result doesn't → bad match
  // At least one seed size must appear in the found sizes.
  for (const s of seedSizes) if (foundSizes.includes(s)) return true;
  return false;
}

function softMatch(seedName, foundName) {
  if (!foundName) return false;
  const a = new Set(tokenize(seedName));
  const b = new Set(tokenize(foundName));
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared < 3) return false;
  // Enforce size match if the seed name has a size signature.
  if (!sizesCompatible(extractSizes(seedName), extractSizes(foundName))) return false;
  return true;
}

// ─── Price parsing ───
function parsePrice(text) {
  if (!text) return null;
  // Strip currency symbol, thousand separators (. or ,), whitespace.
  const cleaned = text.replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 9_999_999) return null;
  return n;
}

// ─── User prompt for challenge solving ───
function promptUser(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => { rl.close(); resolve(); });
  });
}

// ─── Main scrape loop ───
async function main() {
  console.log(`🛒 Scraping ${adapter.slug} (col ${adapter.colIndex})`);
  console.log(`   Connecting to Chrome at http://127.0.0.1:${args.port} ...`);

  async function connectBrowser() {
    return puppeteer.connect({
      browserURL: `http://127.0.0.1:${args.port}`,
      defaultViewport: null,
    });
  }

  let browser;
  try {
    browser = await connectBrowser();
  } catch (e) {
    console.error(`❌ Could not connect to Chrome at port ${args.port}.`);
    console.error(`   Launch Chrome first:`);
    console.error(`     chrome --remote-debugging-port=${args.port} --user-data-dir=/tmp/scrape-profile`);
    console.error(`   Then visit ${adapter.homepage} once and clear any challenge.`);
    process.exit(1);
  }

  // Always open a fresh tab so multiple scrapes can run in parallel without
  // fighting for the same page. Cookies are browser-wide so the new tab still
  // inherits any anti-bot session warmed on other tabs.
  let page = await browser.newPage();
  await page.bringToFront();

  // Detect "Frame detached" / "Target closed" errors that puppeteer throws
  // when Chrome reloads the page out from under us (anti-bot navigations,
  // long-running tab churn). When detected, we recreate the page and retry.
  function isFrameError(e) {
    const m = String(e?.message || '');
    return /detached Frame|Target closed|Session closed|Page is closed|Execution context was destroyed/i.test(m);
  }

  async function recreatePage() {
    try { await page.close(); } catch {}
    // Try to make a new page on the existing browser; if the CDP connection
    // itself is dead (Chrome dropped us), reconnect from scratch.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        page = await browser.newPage();
        await page.bringToFront();
        try {
          await page.goto(adapter.homepage, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch {}
        return;
      } catch (e) {
        console.log(`   recreatePage attempt ${attempt + 1} failed: ${String(e?.message || e).slice(0, 80)}`);
        try { await browser.disconnect(); } catch {}
        await new Promise((r) => setTimeout(r, 2000));
        try {
          browser = await connectBrowser();
        } catch (re) {
          console.log(`   reconnect failed: ${String(re?.message || re).slice(0, 80)}`);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
    throw new Error('recreatePage exhausted retries');
  }

  // Check for challenge state up front by visiting the homepage.
  console.log(`   Probing ${adapter.homepage} for challenge state...`);
  try {
    await page.goto(adapter.homepage, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.warn(`   ⚠️  Initial homepage load failed: ${e.message}`);
  }
  if (adapter.isChallenge && adapter.isChallenge(page)) {
    console.log(`\n⚠️  ${adapter.slug} challenge detected at ${page.url()}`);
    console.log(`    In your attached Chrome window, solve the challenge / wait for the queue.`);
    await promptUser(`    Press Enter once you can browse ${adapter.homepage} normally... `);
  }

  const allMissing = loadMissing(adapter.colIndex);
  console.log(`   ${allMissing.length} products missing this column in seed.mjs`);

  // Resume: skip names already present in results (success OR legitimate
  // miss). The trailing-null cleanup script removes only the failed-stretch
  // entries before resume, so any null still in results is an honest miss
  // not worth retrying.
  const startIdx = args.start;
  let queue;
  if (startIdx > 0) {
    queue = allMissing.slice(startIdx);
  } else {
    queue = allMissing.filter((r) => !(r.name in results));
    const skipped = allMissing.length - queue.length;
    if (skipped > 0) console.log(`   resuming: ${skipped} already done in ${path.basename(OUT_PATH)}`);
  }
  if (Number.isFinite(args.limit)) queue = queue.slice(0, args.limit);
  console.log(`   processing ${queue.length} products this run\n`);

  // Graceful SIGINT.
  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log('\n⏸  SIGINT — finishing current product and saving...');
  });

  let firstUrlLogged = false;
  let okCount = 0;
  let nullCount = 0;
  let errCount = 0;

  for (let i = 0; i < queue.length; i++) {
    if (stopping) break;
    const row = queue[i];
    const idx = String(i + 1).padStart(4);
    const total = queue.length;
    const q = buildQuery(row);
    const url = adapter.searchUrl(q);

    if (!firstUrlLogged) {
      console.log(`   first URL: ${url}`);
      firstUrlLogged = true;
    }

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Re-check challenge per request.
      if (adapter.isChallenge && adapter.isChallenge(page)) {
        console.log(`\n⚠️  challenge mid-run at ${page.url()}`);
        await promptUser(`    Solve in browser, then press Enter to retry... `);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      if (adapter.beforeExtract) {
        try { await adapter.beforeExtract(page); } catch {}
      }

      // Probe card selectors in order; first one to appear within 8s wins.
      let cardSelector = null;
      for (const sel of adapter.cardSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 8000 });
          cardSelector = sel;
          break;
        } catch {}
      }

      if (!cardSelector) {
        // No card matched. Print page title once for first failure to help debugging.
        if (errCount === 0) {
          const title = await page.title().catch(() => '?');
          console.log(`\n   ⚠️  no card selector matched. URL=${page.url()} title="${title}"`);
          console.log(`       update adapter.cardSelectors and rerun.\n`);
        }
        errCount++;
        results[row.name] = null;
        nullCount++;
        saveResults();
        process.stdout.write(`   [${idx}/${total}] ${row.name.slice(0, 50)} → no card\n`);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      let extracted;
      if (adapter.extract) {
        // Adapter provides a custom extractor (e.g. Lider, where utility class
        // names are CSS-module hashes that drift between deploys).
        extracted = await adapter.extract(page, cardSelector);
      } else {
        extracted = await page.evaluate(
          (cardSel, nameSel, priceSel) => {
            const card = document.querySelector(cardSel);
            if (!card) return null;
            const findText = (root, sel) => {
              for (const s of sel.split(',').map((x) => x.trim())) {
                const el = root.querySelector(s);
                if (el && el.textContent) return el.textContent.trim();
              }
              return null;
            };
            return {
              name: findText(card, nameSel),
              price: findText(card, priceSel),
            };
          },
          cardSelector,
          adapter.nameSelector,
          adapter.priceSelector
        );
      }

      const foundName = extracted?.name || null;
      const price = parsePrice(extracted?.price);

      if (price && softMatch(row.name, foundName)) {
        results[row.name] = price;
        okCount++;
        process.stdout.write(`   [${idx}/${total}] ${row.name.slice(0, 50)} → $${price}\n`);
      } else {
        results[row.name] = null;
        nullCount++;
        const reason = !price ? 'no price' : 'name mismatch';
        process.stdout.write(`   [${idx}/${total}] ${row.name.slice(0, 50)} → ${reason}\n`);
      }
    } catch (e) {
      // Recover from detached-frame / closed-target errors by recreating the
      // page. Don't write a result so we'll retry this product on next iteration.
      if (isFrameError(e)) {
        process.stdout.write(`   [${idx}/${total}] ${row.name.slice(0, 50)} → frame detached, recreating page\n`);
        await recreatePage();
        i--; // retry this product on the new page
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      errCount++;
      results[row.name] = null;
      nullCount++;
      process.stdout.write(`   [${idx}/${total}] ${row.name.slice(0, 50)} → ERR ${e.message.slice(0, 60)}\n`);
    }

    saveResults();
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n✅ done: ok=${okCount} null=${nullCount} err=${errCount}`);
  console.log(`   wrote ${OUT_PATH}`);
  console.log(`   next: node scripts/merge-prices.mjs --site ${adapter.slug}`);

  try { await page.close(); } catch {}
  await browser.disconnect();
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
