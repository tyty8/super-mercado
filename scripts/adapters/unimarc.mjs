// Unimarc — VTEX-ish React storefront. Search URL is /search?q=...
//
// Each product is wrapped in CSS-module-hashed divs (Link_link__mnW8_,
// baseContainer_container__Cr9jf, ab__shelves, abc__shelves...). The product
// link element wraps only the image, so we use the link as an anchor and
// walk UP to find the price-bearing card wrapper.
//
// Cards typically show TWO prices: a Club Unimarc loyalty price and the
// regular price. We pick the REGULAR price (the last $X non-per-unit value)
// for fair comparison with other supermarkets.
export default {
  slug: 'unimarc',
  colIndex: 3,
  homepage: 'https://www.unimarc.cl',
  searchUrl: (q) => 'https://www.unimarc.cl/search?q=' + encodeURIComponent(q),

  cardSelectors: [
    'a[href*="/product/"]',
  ],

  extract: async (page, cardSelector) => {
    return page.evaluate((sel) => {
      const link = document.querySelector(sel);
      if (!link) return null;

      // Walk up until we find a parent whose textContent looks like a single
      // product card (has a $-price, substantial but bounded text length).
      let card = link.parentElement;
      while (card) {
        const text = (card.textContent || '').trim();
        if (text.includes('$') && text.length > 60 && text.length < 600) break;
        card = card.parentElement;
      }
      if (!card) return null;

      const skipExact = new Set(['Agregar', 'Club Unimarc', '+', '-']);
      const skipRegex = [
        /^\d+%$/,                              // discount badge
        /^\(\$/,                               // per-unit "($950 x l)"
        /^\d+\s*(litro|kg|gr|ml|cc|un|lt)\b/i, // "1 litro" unit footnote
        /^x\s*\d+/i,
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

      // Unimarc embeds suffixes in price leaves like "$3.990\n c/u" — match
      // the leading $X but allow trailing junk. Bundle deals like "2 x $5.990"
      // do NOT start with $, so they're correctly excluded.
      const prices = [];
      const nameParts = [];
      for (const t of leaves) {
        const priceMatch = t.match(/^\$([\d.,]+)/);
        if (priceMatch) prices.push('$' + priceMatch[1]);
        else if (!t.includes('$')) nameParts.push(t);
      }

      // Longest non-price leaf is the full product name (beats brand-only).
      let name = '';
      for (const p of nameParts) if (p.length > name.length) name = p;

      // Last $-price = regular price (Club Unimarc discount comes first).
      const price = prices.length > 0 ? prices[prices.length - 1] : null;

      return { name: name || null, price };
    }, cardSelector);
  },

  isChallenge: (_page) => false,

  beforeExtract: async (page) => {
    // VTEX hydrates after DOMContentLoaded; give it a moment.
    await new Promise((r) => setTimeout(r, 1500));
  },
};
