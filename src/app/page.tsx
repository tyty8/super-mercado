"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { pricePerUnit, isStoreBrand } from "@/lib/units";

interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  unit: string;
  prices: Record<string, number>;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface ComparisonItem {
  productId: number;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

interface ComparisonEntry {
  supermarket: string;
  slug: string;
  total: number;
  availableCount: number;
  totalCount: number;
  items: ComparisonItem[];
}

interface Substitute {
  productId: number;
  name: string;
  brand: string;
  unit: string;
  price: number;
}

interface OptimalSplitStore {
  slug: string;
  name: string;
  total: number;
  items: ComparisonItem[];
}

interface ComparisonResult {
  comparison: ComparisonEntry[];
  savings: {
    cheapest: string;
    cheapestSlug: string;
    mostExpensive: string;
    mostExpensiveSlug: string;
    savedAmount: number;
  };
  optimalSplit: {
    stores: OptimalSplitStore[];
    total: number;
    missingCount: number;
    savingsVsCheapestStore: number;
  };
  substitutes: Record<string, Record<number, Substitute[]>>;
}

interface CategoryRow {
  category: string;
  count: number;
}

const SUPERMARKET_COLORS: Record<string, string> = {
  jumbo: "#00a650",
  lider: "#0071ce",
  tottus: "#e31837",
  unimarc: "#e4002b",
  "santa-isabel": "#e30613",
};

const STORAGE_KEY = "super-mercado-cart-v1";

const formatCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

// ─── Cart serialization for URL sharing & localStorage ───
function serializeCart(cart: CartItem[]): string {
  return cart.map((c) => `${c.product.id}:${c.quantity}`).join(",");
}

function parseCart(s: string): Array<{ id: number; quantity: number }> {
  return s
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const [id, qty] = pair.split(":");
      return { id: parseInt(id, 10), quantity: parseInt(qty, 10) || 1 };
    })
    .filter((x) => Number.isFinite(x.id) && x.id > 0);
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [hideStoreBrands, setHideStoreBrands] = useState(false);
  const [showOptimalSplit, setShowOptimalSplit] = useState(true);
  const [showCart, setShowCart] = useState(false); // mobile drawer
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [loadingCategory, setLoadingCategory] = useState(false);

  // Starter list
  const [loadingStarter, setLoadingStarter] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cartHydratedRef = useRef(false);

  // ─── Hydrate cart from URL or localStorage on first load ───
  useEffect(() => {
    if (cartHydratedRef.current) return;
    cartHydratedRef.current = true;

    let serialized: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      serialized = params.get("cart");
    } catch {}
    if (!serialized) {
      try {
        serialized = localStorage.getItem(STORAGE_KEY);
      } catch {}
    }
    if (!serialized) return;

    const parsed = parseCart(serialized);
    if (parsed.length === 0) return;

    const ids = parsed.map((p) => p.id).join(",");
    fetch(`/api/products?ids=${ids}`)
      .then((r) => r.json())
      .then((data: { products: Product[] }) => {
        const productMap = new Map(data.products.map((p) => [p.id, p]));
        const restored = parsed
          .map((p) => {
            const product = productMap.get(p.id);
            return product ? { product, quantity: p.quantity } : null;
          })
          .filter((c): c is CartItem => c !== null);
        if (restored.length > 0) setCart(restored);
      })
      .catch(() => {});
  }, []);

  // ─── Persist cart to localStorage on change ───
  useEffect(() => {
    if (!cartHydratedRef.current) return;
    try {
      if (cart.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, serializeCart(cart));
      }
    } catch {}
  }, [cart]);

  // ─── Fetch categories on first load ───
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data: { categories: CategoryRow[] }) => {
        if (Array.isArray(data.categories)) setCategories(data.categories);
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search products
  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/products?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.products || []);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchProducts(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchProducts]);

  // Compare prices when cart changes
  useEffect(() => {
    if (cart.length === 0) {
      setComparison(null);
      return;
    }
    const compare = async () => {
      setIsComparing(true);
      try {
        const res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((c) => ({
              productId: c.product.id,
              quantity: c.quantity,
            })),
          }),
        });
        const data = await res.json();
        setComparison(data);
      } catch {
        setComparison(null);
      } finally {
        setIsComparing(false);
      }
    };
    compare();
  }, [cart]);

  // ─── Cart operations ───
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setQuery("");
    setShowDropdown(false);
  }, []);

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.product.id === productId
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  };

  // ─── Category browsing ───
  const openCategory = async (cat: string) => {
    setActiveCategory(cat);
    setCategoryOpen(true);
    setLoadingCategory(true);
    try {
      const res = await fetch(`/api/products?category=${encodeURIComponent(cat)}`);
      const data = await res.json();
      let products: Product[] = data.products || [];
      if (hideStoreBrands) products = products.filter((p) => !isStoreBrand(p.brand));
      setCategoryProducts(products);
    } catch {
      setCategoryProducts([]);
    } finally {
      setLoadingCategory(false);
    }
  };

  // ─── Starter list ───
  const loadStarter = async () => {
    setLoadingStarter(true);
    try {
      const res = await fetch("/api/starter");
      const data: { products: Product[] } = await res.json();
      const newCart: CartItem[] = (data.products || []).map((p) => ({
        product: p,
        quantity: 1,
      }));
      setCart(newCart);
      setCategoryOpen(false);
    } catch {} finally {
      setLoadingStarter(false);
    }
  };

  // ─── Share cart via URL ───
  const shareCart = async () => {
    if (cart.length === 0) return;
    const url = new URL(window.location.href);
    url.searchParams.set("cart", serializeCart(cart));
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareToast("Link copiado al portapapeles");
    } catch {
      setShareToast(url.toString());
    }
    setTimeout(() => setShareToast(null), 3000);
  };

  // ─── Derived values ───
  const getMinPrice = (product: Product) => {
    const prices = Object.values(product.prices).filter((p) => p > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  };

  const cartItemCount = useMemo(
    () => cart.reduce((sum, c) => sum + c.quantity, 0),
    [cart]
  );

  const cartCheapestTotal = useMemo(() => {
    if (!comparison) return 0;
    return comparison.comparison[0]?.total || 0;
  }, [comparison]);

  // Filter cart visibility for substitutes by store-brand toggle
  const filteredSearchResults = useMemo(
    () =>
      hideStoreBrands
        ? searchResults.filter((p) => !isStoreBrand(p.brand))
        : searchResults,
    [searchResults, hideStoreBrands]
  );

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 pb-24 lg:pb-6">
      {/* ─── Toolbar: starter + categories + generic toggle ─── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={loadStarter}
          disabled={loadingStarter}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition"
        >
          {loadingStarter ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          )}
          Lista básica
        </button>
        <button
          onClick={() => setCategoryOpen((v) => !v)}
          className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          Categorías
        </button>
        <label className="inline-flex items-center gap-2 ml-auto bg-white border border-slate-300 px-3 py-2 rounded-lg text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideStoreBrands}
            onChange={(e) => setHideStoreBrands(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span className="hidden sm:inline">Ocultar marcas propias</span>
          <span className="sm:hidden">Sin marca propia</span>
        </label>
      </div>

      {/* ─── Category drawer ─── */}
      {categoryOpen && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 animate-fade-in-up">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-slate-800">
              {activeCategory || "Explorar por categoría"}
            </h3>
            <button
              onClick={() => {
                setCategoryOpen(false);
                setActiveCategory(null);
              }}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {!activeCategory ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.category}
                  onClick={() => openCategory(c.category)}
                  className="text-sm bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 px-3 py-2 rounded-lg transition"
                >
                  {c.category}
                  <span className="ml-1.5 text-xs text-slate-500">({c.count})</span>
                </button>
              ))}
            </div>
          ) : loadingCategory ? (
            <div className="text-center py-8 text-slate-400 text-sm">Cargando productos...</div>
          ) : categoryProducts.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Sin productos</div>
          ) : (
            <>
              <button
                onClick={() => setActiveCategory(null)}
                className="text-xs text-blue-600 hover:text-blue-800 mb-3 inline-flex items-center gap-1"
              >
                ← Todas las categorías
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {categoryProducts.map((p) => {
                  const min = getMinPrice(p);
                  const ppu = pricePerUnit(min, p.unit);
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="text-left p-3 bg-slate-50 hover:bg-blue-50 rounded-lg border border-slate-100 transition"
                    >
                      <p className="text-sm font-medium text-slate-800 line-clamp-2">{p.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {p.brand} · {p.unit}
                      </p>
                      <div className="flex items-baseline justify-between mt-1.5">
                        <span className="text-sm font-semibold text-green-600">
                          desde {formatCLP(min)}
                        </span>
                        {ppu && (
                          <span className="text-xs text-slate-400">{ppu.label}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Main grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* ─── Left col: Search + Cart (cart hidden on mobile, in drawer) ─── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search */}
          <div
            ref={searchRef}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4"
          >
            <h2 className="text-base sm:text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Buscar Productos
            </h2>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder="Escribe para buscar... (ej: leche, pollo, arroz)"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition text-sm"
              />
              {isSearching && (
                <div className="absolute right-3 top-3.5">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {showDropdown && filteredSearchResults.length > 0 && (
                <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 max-h-80 overflow-y-auto">
                  {filteredSearchResults.map((product) => {
                    const min = getMinPrice(product);
                    const ppu = pricePerUnit(min, product.unit);
                    return (
                      <button
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-slate-800">
                              {product.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {product.brand} · {product.category} · {product.unit}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-green-600 whitespace-nowrap">
                              desde {formatCLP(min)}
                            </div>
                            {ppu && (
                              <div className="text-xs text-slate-400">{ppu.label}</div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {showDropdown && query.length >= 2 && filteredSearchResults.length === 0 && !isSearching && (
                <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 p-4 text-center text-sm text-slate-500">
                  No se encontraron productos para &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Cart — hidden on mobile (use drawer) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hidden lg:block">
            <CartContents
              cart={cart}
              cartItemCount={cartItemCount}
              updateQuantity={updateQuantity}
              removeFromCart={removeFromCart}
              shareCart={shareCart}
              clearCart={() => setCart([])}
            />
          </div>
        </div>

        {/* ─── Right col: comparison ─── */}
        <div className="lg:col-span-3">
          {cart.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center">
              <svg className="w-16 h-16 sm:w-20 sm:h-20 text-slate-200 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-semibold text-slate-600 mb-2">Comparador de Precios</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                Busca productos, carga la lista básica o explora por categoría para empezar.
              </p>
              <div className="flex justify-center gap-2 mt-6 flex-wrap">
                {["Jumbo", "Líder", "Tottus", "Unimarc", "Santa Isabel"].map((name) => (
                  <span key={name} className="text-xs px-3 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : isComparing ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 animate-pulse-soft">
                  <div className="h-5 bg-slate-200 rounded w-32 mb-2" />
                  <div className="h-8 bg-slate-200 rounded w-24" />
                </div>
              ))}
            </div>
          ) : comparison ? (
            <div className="space-y-4">
              {/* Savings banner */}
              {comparison.savings.savedAmount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 animate-fade-in-up">
                  <p className="text-green-800 font-semibold text-center text-sm sm:text-base">
                    Ahorras{" "}
                    <span className="text-green-600 text-base sm:text-lg">
                      {formatCLP(comparison.savings.savedAmount)}
                    </span>{" "}
                    comprando en{" "}
                    <span className="font-bold">{comparison.savings.cheapest}</span>{" "}
                    vs <span className="text-red-600">{comparison.savings.mostExpensive}</span>
                  </p>
                </div>
              )}

              {/* Optimal split card */}
              {comparison.optimalSplit.stores.length > 1 &&
                comparison.optimalSplit.savingsVsCheapestStore > 0 && (
                  <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-300 rounded-xl p-4 animate-fade-in-up">
                    <button
                      onClick={() => setShowOptimalSplit((v) => !v)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                              Pro tip
                            </span>
                            <h3 className="font-semibold text-slate-800 text-sm sm:text-base">
                              Compra dividida en {comparison.optimalSplit.stores.length} tiendas
                            </h3>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            Total óptimo:{" "}
                            <span className="font-bold text-purple-700">
                              {formatCLP(comparison.optimalSplit.total)}
                            </span>
                            {" — ahorras "}
                            <span className="font-bold text-green-700">
                              {formatCLP(comparison.optimalSplit.savingsVsCheapestStore)}
                            </span>{" "}
                            más vs. la mejor sola tienda
                          </p>
                        </div>
                        <svg className={`w-5 h-5 text-slate-400 transition-transform shrink-0 ${showOptimalSplit ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {showOptimalSplit && (
                      <div className="mt-3 space-y-2">
                        {comparison.optimalSplit.stores.map((s) => (
                          <div key={s.slug} className="bg-white/70 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: SUPERMARKET_COLORS[s.slug] || "#64748b" }}
                                />
                                <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                                <span className="text-xs text-slate-500">
                                  {s.items.length} productos
                                </span>
                              </div>
                              <span className="text-sm font-bold text-slate-700">
                                {formatCLP(s.total)}
                              </span>
                            </div>
                            <ul className="text-xs text-slate-600 ml-4 list-disc">
                              {s.items.slice(0, 4).map((it) => (
                                <li key={it.productId} className="truncate">
                                  {it.name}
                                </li>
                              ))}
                              {s.items.length > 4 && (
                                <li className="text-slate-400">
                                  + {s.items.length - 4} más...
                                </li>
                              )}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              {/* Per-store cards */}
              {comparison.comparison.map((entry, index) => {
                const isCheapest = index === 0 && entry.availableCount === entry.totalCount;
                const isMostExpensive =
                  index === comparison.comparison.length - 1 &&
                  comparison.comparison.length > 1 &&
                  entry.availableCount === entry.totalCount;
                const isExpanded = expandedCard === entry.slug;
                const missingCount = entry.totalCount - entry.availableCount;
                const subs = comparison.substitutes[entry.slug] || {};

                return (
                  <div
                    key={entry.slug}
                    className={`bg-white rounded-xl shadow-sm border-2 transition-all animate-fade-in-up ${
                      isCheapest
                        ? "border-green-400 ring-2 ring-green-100"
                        : isMostExpensive
                        ? "border-red-200"
                        : missingCount > 0
                        ? "border-amber-200"
                        : "border-slate-200"
                    }`}
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <button
                      onClick={() => setExpandedCard(isExpanded ? null : entry.slug)}
                      className="w-full text-left p-4 sm:p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                            style={{ backgroundColor: SUPERMARKET_COLORS[entry.slug] || "#64748b" }}
                          >
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-slate-800 text-sm sm:text-base">
                                {entry.supermarket}
                              </h3>
                              {isCheapest && (
                                <span className="bg-green-100 text-green-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full">
                                  MEJOR PRECIO
                                </span>
                              )}
                              {isMostExpensive && (
                                <span className="bg-red-100 text-red-600 text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full">
                                  Más caro
                                </span>
                              )}
                            </div>
                            {missingCount > 0 ? (
                              <p className="text-xs text-amber-700 mt-0.5 font-medium">
                                ⚠ Faltan {missingCount} de {entry.totalCount} productos — total real sería mayor
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500 mt-0.5">
                                Todos los {entry.totalCount} productos disponibles
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2 sm:gap-3 shrink-0">
                          <div>
                            <p
                              className={`text-xl sm:text-2xl font-bold ${
                                isCheapest
                                  ? "text-green-600"
                                  : isMostExpensive
                                  ? "text-red-600"
                                  : "text-slate-800"
                              }`}
                            >
                              {formatCLP(entry.total)}
                            </p>
                            {!isCheapest && comparison.comparison[0] && (
                              <p className="text-xs text-red-500">
                                +{formatCLP(entry.total - cartCheapestTotal)}
                              </p>
                            )}
                          </div>
                          <svg
                            className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 px-4 sm:px-5 pb-4">
                        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                          <table className="w-full text-sm mt-3">
                            <thead>
                              <tr className="text-slate-500 text-xs">
                                <th className="text-left pb-2 font-medium">Producto</th>
                                <th className="text-right pb-2 font-medium">Precio</th>
                                <th className="text-right pb-2 font-medium">Cant.</th>
                                <th className="text-right pb-2 font-medium">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.items.map((item) => {
                                const ppu = pricePerUnit(item.unitPrice, item.unit);
                                const itemSubs = subs[item.productId];
                                const missing = item.unitPrice === 0;
                                return (
                                  <>
                                    <tr key={item.productId} className="border-t border-slate-50">
                                      <td className={`py-2 ${missing ? "text-amber-700" : "text-slate-700"}`}>
                                        {item.name}
                                        {item.unit && (
                                          <div className="text-[11px] text-slate-400">{item.unit}</div>
                                        )}
                                      </td>
                                      <td className="py-2 text-right text-slate-600">
                                        {missing ? (
                                          <span className="text-amber-600 text-xs">No disponible</span>
                                        ) : (
                                          <>
                                            {formatCLP(item.unitPrice)}
                                            {ppu && (
                                              <div className="text-[10px] text-slate-400">{ppu.label}</div>
                                            )}
                                          </>
                                        )}
                                      </td>
                                      <td className="py-2 text-right text-slate-600">{item.quantity}</td>
                                      <td className="py-2 text-right font-medium text-slate-800">
                                        {item.subtotal > 0 ? formatCLP(item.subtotal) : "—"}
                                      </td>
                                    </tr>
                                    {missing && itemSubs && itemSubs.length > 0 && (
                                      <tr key={`${item.productId}-subs`}>
                                        <td colSpan={4} className="pb-2 px-2">
                                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs">
                                            <p className="text-amber-800 font-medium mb-1">
                                              Sugerencias en {entry.supermarket}:
                                            </p>
                                            <div className="space-y-1">
                                              {itemSubs.map((sub) => (
                                                <div
                                                  key={sub.productId}
                                                  className="flex items-center justify-between gap-2"
                                                >
                                                  <span className="text-slate-700 truncate">
                                                    {sub.name}{" "}
                                                    <span className="text-slate-400">({sub.unit})</span>
                                                  </span>
                                                  <span className="font-semibold text-slate-700 shrink-0">
                                                    {formatCLP(sub.price)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-slate-200">
                                <td colSpan={3} className="pt-2 font-semibold text-slate-800">
                                  Total
                                </td>
                                <td className="pt-2 text-right font-bold text-slate-800">
                                  {formatCLP(entry.total)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* ─── Mobile bottom bar ─── */}
      {cart.length > 0 && (
        <button
          onClick={() => setShowCart(true)}
          className="lg:hidden fixed bottom-4 right-4 left-4 z-30 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg px-5 py-3 flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <span className="bg-white text-blue-700 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {cartItemCount}
            </span>
            Mi carro
          </span>
          {cartCheapestTotal > 0 && (
            <span className="font-bold text-sm">
              desde {formatCLP(cartCheapestTotal)}
            </span>
          )}
        </button>
      )}

      {/* ─── Mobile cart drawer ─── */}
      {showCart && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end" onClick={() => setShowCart(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white w-full rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto p-4 animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
            <CartContents
              cart={cart}
              cartItemCount={cartItemCount}
              updateQuantity={updateQuantity}
              removeFromCart={removeFromCart}
              shareCart={shareCart}
              clearCart={() => setCart([])}
            />
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {shareToast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in-up">
          {shareToast}
        </div>
      )}
    </main>
  );
}

// ─── Cart contents (shared by desktop sidebar + mobile drawer) ───
function CartContents({
  cart,
  cartItemCount,
  updateQuantity,
  removeFromCart,
  shareCart,
  clearCart,
}: {
  cart: CartItem[];
  cartItemCount: number;
  updateQuantity: (productId: number, delta: number) => void;
  removeFromCart: (productId: number) => void;
  shareCart: () => void;
  clearCart: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base sm:text-lg font-semibold text-slate-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          Mi Carro
          {cart.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {cartItemCount} items
            </span>
          )}
        </h2>
        {cart.length > 0 && (
          <button
            onClick={shareCart}
            className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 font-medium"
            title="Copiar link del carro"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Compartir
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <div className="text-center py-8">
          <svg className="w-16 h-16 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <p className="text-slate-400 text-sm">Agrega productos para comparar precios</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cart.map((item) => {
            const minPrice = Math.min(
              ...Object.values(item.product.prices).filter((p) => p > 0)
            );
            const ppu = pricePerUnit(minPrice, item.product.unit);
            return (
              <div
                key={item.product.id}
                className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg animate-fade-in-up"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                    <span>{item.product.unit}</span>
                    {ppu && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>{ppu.label}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => updateQuantity(item.product.id, -1)}
                    className="w-8 h-8 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm font-semibold text-slate-800">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product.id, 1)}
                    className="w-8 h-8 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => removeFromCart(item.product.id)}
                  className="text-slate-400 hover:text-red-500 transition p-1 shrink-0"
                  aria-label="Eliminar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
          <button
            onClick={clearCart}
            className="w-full mt-2 text-sm text-red-500 hover:text-red-700 transition py-1"
          >
            Vaciar carro
          </button>
        </div>
      )}
    </>
  );
}
