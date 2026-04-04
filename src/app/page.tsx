"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

interface ComparisonEntry {
  supermarket: string;
  slug: string;
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
}

const SUPERMARKET_COLORS: Record<string, string> = {
  jumbo: "#00a650",
  lider: "#0071ce",
  tottus: "#e31837",
  unimarc: "#e4002b",
  "santa-isabel": "#e30613",
};

const formatCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(n);

export default function Home() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  // Debounced search
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

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setQuery("");
    setShowDropdown(false);
  };

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

  const getMinPrice = (product: Product) => {
    const prices = Object.values(product.prices).filter((p) => p > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  };

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Search & Cart */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search */}
          <div
            ref={searchRef}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4"
          >
            <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
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

              {/* Dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 max-h-80 overflow-y-auto">
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm text-slate-800">
                            {product.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {product.brand} · {product.category} · {product.unit}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-green-600 whitespace-nowrap ml-2">
                          desde {formatCLP(getMinPrice(product))}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && query.length >= 2 && searchResults.length === 0 && !isSearching && (
                <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 p-4 text-center text-sm text-slate-500">
                  No se encontraron productos para &ldquo;{query}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
                />
              </svg>
              Mi Carro
              {cart.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {cart.reduce((sum, c) => sum + c.quantity, 0)} items
                </span>
              )}
            </h2>

            {cart.length === 0 ? (
              <div className="text-center py-8">
                <svg
                  className="w-16 h-16 text-slate-300 mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
                  />
                </svg>
                <p className="text-slate-400 text-sm">
                  Agrega productos para comparar precios
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg animate-fade-in-up"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.product.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-7 h-7 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-7 h-7 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-slate-400 hover:text-red-500 transition p-1"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setCart([])}
                  className="w-full mt-2 text-sm text-red-500 hover:text-red-700 transition py-1"
                >
                  Vaciar carro
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Comparison Results */}
        <div className="lg:col-span-3">
          {cart.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
              <svg
                className="w-20 h-20 text-slate-200 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-slate-600 mb-2">
                Comparador de Precios
              </h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                Busca y agrega productos a tu carro para ver en qué supermercado
                te sale más barato tu compra completa.
              </p>
              <div className="flex justify-center gap-3 mt-6 flex-wrap">
                {["Jumbo", "Líder", "Tottus", "Unimarc", "Santa Isabel"].map(
                  (name) => (
                    <span
                      key={name}
                      className="text-xs px-3 py-1 bg-slate-100 text-slate-600 rounded-full"
                    >
                      {name}
                    </span>
                  )
                )}
              </div>
            </div>
          ) : isComparing ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 animate-pulse-soft"
                >
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
                  <p className="text-green-800 font-semibold text-center">
                    Ahorras{" "}
                    <span className="text-green-600 text-lg">
                      {formatCLP(comparison.savings.savedAmount)}
                    </span>{" "}
                    comprando en{" "}
                    <span className="font-bold">
                      {comparison.savings.cheapest}
                    </span>{" "}
                    vs{" "}
                    <span className="text-red-600">
                      {comparison.savings.mostExpensive}
                    </span>
                  </p>
                </div>
              )}

              {/* Supermarket cards */}
              {comparison.comparison.map((entry, index) => {
                const isCheapest = index === 0;
                const isMostExpensive =
                  index === comparison.comparison.length - 1 &&
                  comparison.comparison.length > 1;
                const isExpanded = expandedCard === entry.slug;

                return (
                  <div
                    key={entry.slug}
                    className={`bg-white rounded-xl shadow-sm border-2 transition-all animate-fade-in-up ${
                      isCheapest
                        ? "border-green-400 ring-2 ring-green-100"
                        : isMostExpensive
                        ? "border-red-200"
                        : "border-slate-200"
                    }`}
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <button
                      onClick={() =>
                        setExpandedCard(isExpanded ? null : entry.slug)
                      }
                      className="w-full text-left p-5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                            style={{
                              backgroundColor:
                                SUPERMARKET_COLORS[entry.slug] || "#64748b",
                            }}
                          >
                            {index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-slate-800">
                                {entry.supermarket}
                              </h3>
                              {isCheapest && (
                                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                  MEJOR PRECIO
                                </span>
                              )}
                              {isMostExpensive && (
                                <span className="bg-red-100 text-red-600 text-xs font-medium px-2 py-0.5 rounded-full">
                                  Más caro
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {entry.items.filter((i) => i.unitPrice > 0).length}{" "}
                              de {entry.items.length} productos disponibles
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <p
                              className={`text-2xl font-bold ${
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
                                +
                                {formatCLP(
                                  entry.total -
                                    comparison.comparison[0].total
                                )}
                              </p>
                            )}
                          </div>
                          <svg
                            className={`w-5 h-5 text-slate-400 transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </div>
                    </button>

                    {/* Expanded item breakdown */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-5 pb-4">
                        <table className="w-full text-sm mt-3">
                          <thead>
                            <tr className="text-slate-500 text-xs">
                              <th className="text-left pb-2 font-medium">
                                Producto
                              </th>
                              <th className="text-right pb-2 font-medium">
                                Precio
                              </th>
                              <th className="text-right pb-2 font-medium">
                                Cant.
                              </th>
                              <th className="text-right pb-2 font-medium">
                                Subtotal
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.items.map((item) => (
                              <tr
                                key={item.productId}
                                className="border-t border-slate-50"
                              >
                                <td className="py-2 text-slate-700">
                                  {item.name}
                                </td>
                                <td className="py-2 text-right text-slate-600">
                                  {item.unitPrice > 0
                                    ? formatCLP(item.unitPrice)
                                    : "N/D"}
                                </td>
                                <td className="py-2 text-right text-slate-600">
                                  {item.quantity}
                                </td>
                                <td className="py-2 text-right font-medium text-slate-800">
                                  {item.subtotal > 0
                                    ? formatCLP(item.subtotal)
                                    : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200">
                              <td
                                colSpan={3}
                                className="pt-2 font-semibold text-slate-800"
                              >
                                Total
                              </td>
                              <td className="pt-2 text-right font-bold text-slate-800">
                                {formatCLP(entry.total)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
