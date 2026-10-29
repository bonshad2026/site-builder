import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Localized } from '../../types/site';

export interface CartLine {
  productId: string;
  slug: string;
  name: Localized;
  priceMinor: string;
  currency: string;
  imageUrl: string | null;
  quantity: number;
  /** Chosen colour (name as shown), or '' when the product has no colours. */
  option?: string;
  /** Most units allowed for this product in one order. */
  max?: number;
}

/** One cart line per product and colour. */
export const lineKey = (l: { productId: string; option?: string }) => `${l.productId}|${l.option ?? ''}`;

/** Hard ceiling; each line also carries its product and shop limit (`max`). */
export const MAX_QUANTITY = 999;
/** Limit for lines saved without one (before shops could set their own). */
const DEFAULT_LINE_MAX = 50;

/** Pure cart operations (kept separate so they are easy to test). */
export const cartOps = {
  add(lines: CartLine[], line: Omit<CartLine, 'quantity'>, quantity = 1): CartLine[] {
    const key = lineKey(line);
    const cap = Math.min(MAX_QUANTITY, line.max ?? DEFAULT_LINE_MAX);
    const existing = lines.find((l) => lineKey(l) === key);
    if (existing) return lines.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.min(cap, l.quantity + quantity) } : l));
    return [...lines, { ...line, quantity: Math.min(cap, quantity) }];
  },
  /** `key` is a line key (see lineKey); a plain product id also works for lines without a colour. */
  setQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
    const match = (l: CartLine) => lineKey(l) === key || lineKey(l) === `${key}|`;
    if (quantity <= 0) return lines.filter((l) => !match(l));
    return lines.map((l) => (match(l) ? { ...l, quantity: Math.min(MAX_QUANTITY, l.max ?? DEFAULT_LINE_MAX, Math.floor(quantity)) } : l));
  },
  /** Display estimate only: the server recomputes every price when the order is placed. */
  subtotal(lines: CartLine[]): bigint {
    return lines.reduce((sum, l) => sum + BigInt(l.priceMinor) * BigInt(l.quantity), 0n);
  },
};

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotalMinor: string;
  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Cart lives in the browser only (a temporary UI state); orders are created on the server. */
export function CartProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const key = `site-builder:cart:${siteId}`;
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(lines));
    } catch {
      // Ignore: cart still works for this page view.
    }
  }, [key, lines]);

  const add = useCallback((line: Omit<CartLine, 'quantity'>, quantity = 1) => setLines((ls) => cartOps.add(ls, line, quantity)), []);
  const setQuantity = useCallback((key: string, quantity: number) => setLines((ls) => cartOps.setQuantity(ls, key, quantity)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, count: lines.reduce((n, l) => n + l.quantity, 0), subtotalMinor: cartOps.subtotal(lines).toString(), add, setQuantity, clear }),
    [lines, add, setQuantity, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** The cart, or null where there is none (e.g. the builder's preview). */
export function useCartOptional(): CartContextValue | null {
  return useContext(CartContext);
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
