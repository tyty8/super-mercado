import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Super Mercado - Compara Precios Chile",
  description:
    "Compara precios de supermercados chilenos. Arma tu carro y encuentra dónde comprar más barato entre Jumbo, Líder, Tottus, Unimarc y Santa Isabel.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50 pt-safe">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <svg
                className="w-7 h-7 sm:w-8 sm:h-8 text-blue-700 shrink-0"
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
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">
                Super<span className="text-blue-700">Mercado</span>
              </h1>
            </div>
            <div className="flex items-center gap-1 ml-1 sm:ml-2 shrink-0">
              <div className="w-3.5 h-2.5 sm:w-4 sm:h-3 bg-red-600 rounded-sm" />
              <div className="w-3.5 h-2.5 sm:w-4 sm:h-3 bg-white border border-slate-300 rounded-sm" />
              <div className="w-3.5 h-2.5 sm:w-4 sm:h-3 bg-blue-700 rounded-sm" />
            </div>
            <span className="text-sm text-slate-500 hidden sm:block ml-auto">
              Compara precios entre supermercados de Chile
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
