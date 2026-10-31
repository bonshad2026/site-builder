import { BUTTON_STYLES, DEFAULT_REQUEST_TYPES, type SectionButton } from '@site-builder/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useAdminCollections, type AdminItem } from './collections/api';
import { useState } from 'react';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import type { ProductDto, ServiceDto } from '../types/api';
import type { Localized } from '../types/site';
import { useAdminSettings } from './AdminRoot';
import { useT } from './i18n';
import { Checkbox, Field, ListEditor, LocalizedField, SelectField, TextField } from './ui';

interface LinkGroup {
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Everything on the site a link can point to, grouped for a picker: main pages, the site's
 * own pages, services, products, product categories and request forms.
 */
export function useLinkGroups(siteId: string): LinkGroup[] {
  const t = useT();
  const { l } = usePreferences();
  const { data: settings } = useAdminSettings(siteId);
  const modules = settings?.modules ?? {};
  const pages = useQuery({
    queryKey: ['site', siteId, 'pages'],
    queryFn: () => api.get<{ slug: string; isHome: boolean; title?: Localized }[]>(`/sites/${siteId}/pages`),
  });
  const services = useQuery({
    queryKey: ['site', siteId, 'services', 'links'],
    queryFn: () => api.get<ServiceDto[]>(`/sites/${siteId}/services?pageSize=100`),
    enabled: !!modules.services,
  });
  const products = useQuery({
    queryKey: ['site', siteId, 'products', 'links'],
    queryFn: () => api.get<ProductDto[]>(`/sites/${siteId}/products?pageSize=100`),
    enabled: !!modules.products,
  });
  const name = (label: Localized | undefined, fallback: string) => (label && l(label)) || fallback;
  // Content tables: each item has its own page (/classes/hydrant).
  const { data: tables = [] } = useAdminCollections(siteId);
  const tableItems = useQueries({
    queries: tables.map((c) => ({
      queryKey: ['site', siteId, 'collections', c.id, 'items', 'links'],
      queryFn: () => api.get<AdminItem[]>(`/sites/${siteId}/collections/${c.id}/items?pageSize=60&status=published`),
    })),
  });

  const groups: LinkGroup[] = [
    {
      label: t.linkGroupMain,
      options: [
        { value: '/', label: `${t.linkGroupPages}: /` },
        ...(modules.services ? [{ value: '/services', label: `${t.services} (/services)` }] : []),
        ...(modules.products ? [{ value: '/products', label: `${t.products} (/products)` }, { value: '/cart', label: '/cart' }] : []),
      ],
    },
    {
      label: t.linkGroupPages,
      options: (pages.data ?? []).filter((p) => !p.isHome).map((p) => ({ value: `/${p.slug}`, label: `${name(p.title, p.slug)} (/${p.slug})` })),
    },
    {
      label: t.linkGroupRequests,
      options: (settings?.requestTypes ?? DEFAULT_REQUEST_TYPES).map((r) => ({ value: `/contact?type=${r.slug}`, label: `${name(r.label, r.slug)} (/contact?type=${r.slug})` })),
    },
    {
      label: t.linkGroupServices,
      options: (services.data ?? []).map((s) => ({ value: `/services/${s.slug}`, label: name(s.title, s.slug) })),
    },
    {
      label: t.linkGroupCategories,
      options: modules.products ? (settings?.productCategories ?? []).map((c) => ({ value: `/products?category=${c.slug}`, label: name(c.label, c.slug) })) : [],
    },
    {
      label: t.linkGroupProducts,
      options: (products.data ?? []).map((p) => ({ value: `/products/${p.slug}`, label: name(p.name, p.slug) })),
    },
    ...tables.map((c, i) => ({
      label: name(c.name, c.slug),
      options: (tableItems[i]?.data ?? []).map((it) => ({ value: `/${c.slug}/${it.slug}`, label: name(it.title, it.slug) })),
    })),
  ];
  return groups.filter((g) => g.options.length);
}

const CUSTOM = '__custom';

/** Picks a link from the site's pages, products, services and forms, or takes any other link typed in. */
export function LinkPicker({ siteId, label, value, onChange }: { siteId: string; label: string; value: string; onChange: (href: string) => void }) {
  const t = useT();
  const groups = useLinkGroups(siteId);
  const known = groups.some((g) => g.options.some((o) => o.value === value));
  const [custom, setCustom] = useState(false);
  const showCustom = custom || (!!value && !known);
  return (
    <div className="flex flex-col gap-2">
      <Field label={label}>
        {(id) => (
          <select
            id={id}
            value={showCustom ? CUSTOM : value}
            onChange={(e) => {
              const v = e.target.value;
              setCustom(v === CUSTOM);
              if (v !== CUSTOM) onChange(v);
            }}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="">{t.linkNone}</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={CUSTOM}>{t.linkCustom}</option>
          </select>
        )}
      </Field>
      {showCustom && <TextField label={t.url} dir="ltr" value={value} onChange={onChange} hint="/contact · https://… · tel:… · mailto:…" />}
    </div>
  );
}

export const blankButton = (): SectionButton => ({ label: { en: '', fa: '' }, href: '', style: 'primary', newTab: false, action: 'link', product: '' });

/** The site's products as picker options (slug and name). */
export function useProductOptions(siteId: string) {
  const { l } = usePreferences();
  const products = useQuery({
    queryKey: ['site', siteId, 'products', 'links'],
    queryFn: () => api.get<ProductDto[]>(`/sites/${siteId}/products?pageSize=100`),
  });
  return (products.data ?? []).map((p) => ({ value: p.slug, label: l(p.name) || p.slug }));
}

function ProductPicker({ siteId, label, value, onChange }: { siteId: string; label: string; value: string; onChange: (slug: string) => void }) {
  const t = useT();
  const options = useProductOptions(siteId);
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={[{ value: '', label: t.choose }, ...options, ...(value && !options.some((o) => o.value === value) ? [{ value, label: value }] : [])]}
    />
  );
}

/** Any number of buttons; `contentOnly` lets a client change only their wording. */
export function ButtonsEditor({ siteId, label, value, onChange, contentOnly = false }: { siteId: string; label: string; value: SectionButton[]; onChange: (v: SectionButton[]) => void; contentOnly?: boolean }) {
  const t = useT();
  const styleLabel = { primary: t.buttonPrimary, secondary: t.buttonSecondary, link: t.buttonLink };
  if (contentOnly) {
    if (!value.length) return null;
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xs font-medium text-ink-soft">{label}</legend>
        {value.map((b, i) => (
          <LocalizedField key={i} label={`${t.label} #${i + 1}`} value={b.label} onChange={(x) => onChange(value.map((y, j) => (j === i ? { ...y, label: x } : y)))} />
        ))}
      </fieldset>
    );
  }
  return (
    <ListEditor
      label={label}
      items={value}
      max={8}
      onChange={onChange}
      create={blankButton}
      render={(b, update) => (
        <>
          <LocalizedField label={t.label} value={b.label} onChange={(x) => update({ ...b, label: x })} />
          <SelectField
            label={t.buttonAction}
            value={b.action ?? 'link'}
            onChange={(action) => update({ ...b, action })}
            options={[
              { value: 'link', label: t.actionLink },
              { value: 'cart', label: t.actionCart },
            ]}
          />
          {b.action === 'cart' ? (
            <ProductPicker siteId={siteId} label={t.product} value={b.product ?? ''} onChange={(product) => update({ ...b, product })} />
          ) : (
            <LinkPicker siteId={siteId} label={t.link} value={b.href} onChange={(href) => update({ ...b, href })} />
          )}
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <SelectField label={t.buttonStyle} value={b.style} onChange={(style) => update({ ...b, style })} options={BUTTON_STYLES.map((s) => ({ value: s, label: styleLabel[s] }))} />
            {b.action !== 'cart' && <Checkbox label={t.newTab} checked={b.newTab} onChange={(newTab) => update({ ...b, newTab })} />}
          </div>
        </>
      )}
    />
  );
}
