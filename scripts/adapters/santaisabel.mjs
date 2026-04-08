// Santa Isabel — Cencosud / VTEX-ish, slow to hydrate. Search URL is
// /busqueda?ft= (same as the legacy scraper).
//
// Each product card is an <a class="flex flex-col items-start no-underline">
// inside a bordered div wrapper. Cards typically include:
//   - "Agregar a Mis listas" / "Exclusivo online" UI text (skip)
//   - "Lleva 12 por $X" bundle deal text (skip)
//   - "$X" regular price + "$X x lt" per-unit (use the bare $X, last)
//   - brand text + product name
export default {
  slug: 'santaisabel',
  colIndex: 4,
  homepage: 'https://www.santaisabel.cl',
  searchUrl: (q) => 'https://www.santaisabel.cl/busqueda?ft=' + encodeURIComponent(q),

  cardSelectors: [
    'a[class*="flex-col"][class*="items-start"][class*="no-underline"]',
    'a[class*="cursor-pointer"][class*="flex-col"]',
  ],

  extract: async (page, cardSelector) => {
    return page.evaluate((sel) => {
      const card = document.querySelector(sel);
      if (!card) return null;

      const skipExact = new Set([
        'Agregar a Mis listas',
        'Agregar',
        'Mis listas',
        'Exclusivo online',
        'Exclusivo',
        '+',
        '-',
      ]);
      const skipRegex = [
        /^Lleva\s/i,                  // "Lleva 12 por $13.560" bundle deal
        /\bpor\s+\$/i,                // any "por $X" wording
        /^\$[\d.,]+\s*x\s*\w/i,       // per-unit "$1.130 x lt"
        /^\d+(\.\d+)?$/,              // bare star ratings like "4.8"
        /^\d+\s*(litro|kg|gr|ml|cc|un|lt)\b/i,
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

      const prices = [];
      const nameParts = [];
      for (const t of leaves) {
        const m = t.match(/^\$([\d.,]+)$/); // bare price (not "$X x lt")
        if (m) prices.push('$' + m[1]);
        else if (!t.includes('$')) nameParts.push(t);
      }

      // Longest non-price leaf is the full product name
      let name = '';
      for (const p of nameParts) if (p.length > name.length) name = p;

      // Last bare $X = regular price (after any bundle/discount line)
      const price = prices.length > 0 ? prices[prices.length - 1] : null;

      return { name: name || null, price };
    }, cardSelector);
  },

  isChallenge: (page) => {
    const u = page.url();
    return u.includes('/_px/') || u.includes('px-captcha') || u.includes('perimeterx');
  },

  beforeExtract: async (page) => {
    // SI hydrates slowly — give it more time than other sites.
    await new Promise((r) => setTimeout(r, 4000));
  },
};
