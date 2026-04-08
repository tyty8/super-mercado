// Lider (Walmart Chile) — modern domain is super.lider.cl. Queue-It guards
// www.lider.cl/catalogo/* and /supermercado/* but NOT super.lider.cl, so the
// new search domain works once the warmed Chrome session has visited it.
export default {
  slug: 'lider',
  colIndex: 1,
  homepage: 'https://super.lider.cl',
  searchUrl: (q) => 'https://super.lider.cl/search?q=' + encodeURIComponent(q),

  // Each product card is a [role="group"][data-item-id] inside [data-testid="products"].
  // data-item-id is stable, unlike the CSS-module utility classes.
  cardSelectors: [
    '[data-testid="products"] [role="group"][data-item-id]',
    '[role="group"][data-item-id]',
    '[data-item-id]',
  ],

  // The class names inside cards are CSS-module hashes (ld_Ej, w_eEg0, mr1)
  // that change between deploys. Skip selectors and walk the card's text
  // leaves: pick the first $-prefixed leaf as price, the longest non-button
  // text leaf as the name.
  extract: async (page, cardSelector) => {
    return page.evaluate((sel) => {
      const card = document.querySelector(sel);
      if (!card) return null;
      const skip = new Set(['Agregar', 'Producto patrocinado', 'Oferta', 'Patrocinado']);
      let price = null;
      let name = '';
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_ELEMENT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.children.length > 0) continue;
        const t = (node.textContent || '').trim();
        if (!t || t.length > 200) continue;
        if (skip.has(t)) continue;
        if (!price && /^\$[\d.,]+$/.test(t)) {
          price = t;
          continue;
        }
        if (/^precio\s/i.test(t)) continue; // accessible "precio actual $X" duplicate
        if (t.length > name.length) name = t;
      }
      return { name: name || null, price };
    }, cardSelector);
  },

  isChallenge: (page) => {
    const u = page.url();
    return u.includes('queue-it.net') || u.includes('walmartcl.queue-it');
  },

  beforeExtract: async (page) => {
    await new Promise((r) => setTimeout(r, 600));
  },
};
