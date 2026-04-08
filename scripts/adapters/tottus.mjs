// Tottus — Falabella's commerce platform. Real domain is tottus.cl (the
// /tottus-cl path on tottus.falabella.com redirects there). Search URL pattern
// is /tottus-cl/buscar?Ntt=.
//
// Each product card is [data-pod]. Inside the card, text leaves include
// brand (e.g. "SOPROLE"), name ("Leche Entera Natural"), size ("1 LT"),
// price ("$  1.190"), and unit suffix ("UN"). Use a custom extractor to
// concatenate brand+name and pull the first $-prefixed leaf as price.
export default {
  slug: 'tottus',
  colIndex: 2,
  homepage: 'https://www.tottus.cl/tottus-cl',
  searchUrl: (q) => 'https://www.tottus.cl/tottus-cl/buscar?Ntt=' + encodeURIComponent(q),

  cardSelectors: [
    '[data-pod]',
    '.pod',
    'div[class*="pod"]',
  ],

  extract: async (page, cardSelector) => {
    return page.evaluate((sel) => {
      const card = document.querySelector(sel);
      if (!card) return null;

      // Skip noisy text leaves that aren't the product identity.
      const skipExact = new Set([
        'UN', 'KG', 'LT', 'ML', 'GR', 'CC',
        'Por TOTTUS', 'Por tottus', 'rápido', 'rapido',
        'Agregar', '+', '-',
        'Llega gratis', 'Despacho gratis',
      ]);
      const skipRegex = [
        /^\(\$/,                  // unit price like "($  1.190 por LT)"
        /^\d+\s*un$/i,            // "0 un"
        /^por\s/i,                // "Por TOTTUS"
        /^llega\s/i,
        /^despacho/i,
        /\bcuotas?\b/i,           // installment text
      ];

      const leaves = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_ELEMENT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.children.length > 0) continue;
        const t = (n.textContent || '').trim();
        if (!t || t.length > 200) continue;
        if (skipExact.has(t)) continue;
        if (skipRegex.some((r) => r.test(t))) continue;
        leaves.push(t);
      }

      // First $-prefixed leaf is the price.
      let price = null;
      const nameParts = [];
      for (const t of leaves) {
        if (!price && /^\$\s*[\d.,]+/.test(t)) {
          price = t;
          continue;
        }
        if (/^\$/.test(t)) continue; // ignore secondary prices (per-unit, original)
        nameParts.push(t);
      }

      const name = nameParts.join(' ').trim() || null;
      return { name, price };
    }, cardSelector);
  },

  isChallenge: (page) => {
    const u = page.url();
    return u.includes('akamai') || u.includes('/_sec/') || u.includes('px-captcha');
  },

  beforeExtract: async (page) => {
    // Tottus sometimes opens a delivery-location modal on first visit.
    try { await page.keyboard.press('Escape'); } catch {}
    await new Promise((r) => setTimeout(r, 800));
  },
};
