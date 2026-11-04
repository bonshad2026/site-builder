import type { ProductDto } from '../../../types/api';

/** Price after the product's discount, as the server computes it for orders (integer division). */
export function finalPrice(p: Pick<ProductDto, 'priceMinor' | 'discountPercent'>): string | null {
  if (p.priceMinor === null) return null;
  const pct = p.discountPercent ?? 0;
  return pct ? ((BigInt(p.priceMinor) * BigInt(100 - pct)) / 100n).toString() : p.priceMinor;
}

/** Sold out: switched off, or no stock left. */
export const isSoldOut = (p: Pick<ProductDto, 'isAvailable' | 'stock'>) => !p.isAvailable || p.stock === 0;
