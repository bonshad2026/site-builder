import { currencyDecimals, PRODUCT_EXPORT_FIELDS, type ProductExportField, type SiteSettings } from '@site-builder/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { finalPrice } from '../../features/public-site/components/price';
import { api, apiRequest } from '../../lib/api';
import type { ProductDto } from '../../types/api';
import { useAdminSettings } from '../AdminRoot';
import { useT, type AdminStrings } from '../i18n';
import { Checkbox, ErrorNote, Modal } from '../ui';

const label = (t: AdminStrings): Record<ProductExportField, string> => ({
  slug: t.colSlug,
  nameFa: t.colNameFa,
  nameEn: t.colNameEn,
  category: t.colCategory,
  price: t.colPrice,
  discountPercent: t.colDiscount,
  finalPrice: t.colFinalPrice,
  currency: t.colCurrency,
  stock: t.colStock,
  isAvailable: t.colAvailable,
  featured: t.colFeatured,
  status: t.colStatus,
  colors: t.colColors,
  attributes: t.colAttributes,
  descriptionFa: t.colDescFa,
  descriptionEn: t.colDescEn,
  imageUrl: t.colImage,
  galleryUrls: t.colGallery,
  pageUrl: t.colPage,
});

/** Every product (all statuses), page by page. */
async function allProducts(siteId: string): Promise<ProductDto[]> {
  const out: ProductDto[] = [];
  for (let page = 1; ; page++) {
    const res = await apiRequest<ProductDto[]>(`/sites/${siteId}/products?page=${page}&pageSize=100`);
    out.push(...res.data);
    if (page >= (res.meta?.totalPages ?? 1)) return out;
  }
}

const money = (minor: string | null | undefined, currency: string) => (minor === null || minor === undefined || minor === '' ? '' : String(Number(minor) / 10 ** currencyDecimals(currency)));
const abs = (url: string | null | undefined) => (url ? new URL(url, window.location.origin).href : '');

function cell(p: ProductDto, f: ProductExportField, settings: SiteSettings | undefined): string {
  const cat = settings?.productCategories?.find((c) => c.slug === p.category);
  switch (f) {
    case 'slug':
      return p.slug;
    case 'nameFa':
      return p.name.fa;
    case 'nameEn':
      return p.name.en;
    case 'category':
      return cat ? cat.label.fa || cat.label.en || cat.slug : (p.category ?? '');
    case 'price':
      return money(p.priceMinor, p.currency);
    case 'discountPercent':
      return String(p.discountPercent ?? 0);
    case 'finalPrice':
      return money(finalPrice(p), p.currency);
    case 'currency':
      return p.currency;
    case 'stock':
      return p.stock === null ? '' : String(p.stock);
    case 'isAvailable':
      return p.isAvailable ? '1' : '0';
    case 'featured':
      return p.featured ? '1' : '0';
    case 'status':
      return p.status;
    case 'colors':
      return (p.colors ?? []).map((c) => `${c.name.fa || c.name.en} (${c.hex})`).join(' | ');
    case 'attributes':
      return (p.attributes ?? []).map((a) => `${a.name.fa || a.name.en}: ${a.value.fa || a.value.en}`).join(' | ');
    case 'descriptionFa':
      return p.description.fa;
    case 'descriptionEn':
      return p.description.en;
    case 'imageUrl':
      return abs(p.imageUrl);
    case 'galleryUrls':
      return (p.gallery ?? []).map((g) => abs(g.url)).join(' | ');
    case 'pageUrl':
      return `/products/${p.slug}`;
  }
}

/** CSV with a UTF-8 BOM so Excel opens Persian text correctly. */
function toCsv(rows: string[][]) {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

/** Exports the products to a file Excel opens, with the columns chosen here (saved per site for next time). */
export function ProductExport({ siteId }: { siteId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: settings } = useAdminSettings(siteId);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ProductExportField[]>([]);
  useEffect(() => {
    if (open) setFields(settings?.exportOptions?.productFields ?? ['slug', 'nameFa', 'category', 'price', 'stock', 'imageUrl']);
  }, [open, settings]);
  const names = label(t);

  const run = useMutation({
    mutationFn: async () => {
      const chosen = PRODUCT_EXPORT_FIELDS.filter((f) => fields.includes(f));
      // Remember the choice for this site (only when it changed).
      if (settings && JSON.stringify(settings.exportOptions?.productFields) !== JSON.stringify(chosen)) {
        const saved = await api.put<SiteSettings>(`/sites/${siteId}/settings`, { ...settings, exportOptions: { productFields: chosen } });
        qc.setQueryData(['site', siteId, 'settings'], saved);
      }
      const products = await allProducts(siteId);
      const csv = toCsv([chosen.map((f) => names[f]), ...products.map((p) => chosen.map((f) => cell(p, f, settings)))]);
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
        download: `products-${siteId}-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    },
    onSuccess: () => setOpen(false),
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t.exportExcel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t.exportExcel}>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-sm text-ink-soft">{t.exportColumns}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRODUCT_EXPORT_FIELDS.map((f) => (
              <Checkbox key={f} label={names[f]} checked={fields.includes(f)} onChange={(on) => setFields((x) => (on ? [...x, f] : x.filter((y) => y !== f)))} />
            ))}
          </div>
          <ErrorNote error={run.error} />
          <div className="flex justify-end">
            <Button onClick={() => run.mutate()} disabled={!fields.length || run.isPending}>
              {run.isPending ? t.exporting : t.exportDownload}
            </Button>
          </div>
        </fieldset>
      </Modal>
    </>
  );
}
