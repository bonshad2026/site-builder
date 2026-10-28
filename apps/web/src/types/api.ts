import type { PageDocument, SiteSettings } from '@site-builder/shared';
import type { Localized } from './site';

export type { PageDocument, SiteSettings };

export interface ServiceDto {
  id: string;
  slug: string;
  title: Localized;
  summary: Localized;
  body: Localized;
  imageAssetId: string | null;
  imageUrl: string | null;
  duration: Localized;
  startingFrom: Localized;
  deliverables: Localized[];
  process: { title: Localized; text: Localized }[];
  status: 'draft' | 'published' | 'archived';
  position: number;
  seo: Record<string, unknown>;
}

export interface ProductDto {
  id: string;
  slug: string;
  name: Localized;
  description: Localized;
  category: string | null;
  /** Integer string in the currency's minor unit (rials for IRR). */
  priceMinor: string | null;
  currency: string;
  stock: number | null;
  isAvailable: boolean;
  /** Percentage off; the server applies it to orders. */
  discountPercent?: number;
  colors?: { name: Localized; hex: string }[];
  maxPerOrder?: number | null;
  featured: boolean;
  materials: Localized;
  dimensions: string;
  leadTime: Localized;
  imageAssetId: string | null;
  imageUrl: string | null;
  status: 'draft' | 'published' | 'archived';
  position: number;
  seo: Record<string, unknown>;
}

export interface PublishedPage {
  slug: string;
  title: Localized;
  isHome: boolean;
  seo: { title?: Partial<Localized>; description?: Partial<Localized>; noIndex?: boolean };
  document: PageDocument;
}

export interface OrderItemDto {
  productId: string | null;
  productSlug: string;
  productName: Localized;
  unitPriceMinor: string;
  quantity: number;
  lineTotalMinor: string;
  option?: string;
}

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'test_paid' | 'failed' | 'refunded';
export type OrderStatus = 'pending' | 'confirmed' | 'fulfilled' | 'cancelled';
