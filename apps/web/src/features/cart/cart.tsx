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
}

export const MAX_QUANTITY = 50;

/** Pure cart operations (kept separate so they are easy to test). */
export const cartOps = {
  add(lines: CartLine[], line: Omit<CartLine, 'quantity'>, quantity = 1): CartLine[] {
    const existing = lines.find((l) => l.productId === line.productId);
    if (existing) return lines.map((l) => (l.productId === line.productId ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l));
    return [...lines, { ...line, quantity: Math.min(MAX_QUANTITY, quantity) }];
  },
  setQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
    if (quantity <= 0) return lines.filter((l) => l.productId !== productId);
    return lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QUANTITY, Math.floor(quantity)) } : l));
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
  setQuantity: (productId: string, quantity: number) => void;
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
  const setQuantity = useCallback((productId: string, quantity: number) => setLines((ls) => cartOps.setQuantity(ls, productId, quantity)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, count: lines.reduce((n, l) => n + l.quantity, 0), subtotalMinor: cartOps.subtotal(lines).toString(), add, setQuantity, clear }),
    [lines, add, setQuantity, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
