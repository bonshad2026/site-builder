import type { CardBlock, PublicCollection, PublicItem } from '@site-builder/shared';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import { useCartOptional } from '../cart/cart';
import { useSiteCalendar, useSiteSettings } from '../public-site/data';
import { formatDay, type CalendarSystem } from '../../lib/calendar';
import { itemHref } from './data';

type Prefs = ReturnType<typeof usePreferences>;
type Loc = { en?: string; fa?: string };

const isLoc = (v: unknown): v is Loc => !!v && typeof v === 'object' && !Array.isArray(v) && ('en' in v || 'fa' in v);

/** A field value as text for visitors (dates in the site's calendar, prices, choices and references made readable). */
export function formatFieldValue(item: PublicItem, collection: PublicCollection | undefined, key: string, p: Prefs, cal: CalendarSystem = p.locale === 'fa' ? 'jalali' : 'gregorian'): string {
  if (key === 'title') return p.l(item.title);
  if (key === 'slug') return item.slug;
  const value = item.data[key];
  if (value === null || value === undefined || value === '') return '';
  const field = collection?.fields.find((f) => f.key === key);
  const optionLabel = (v: unknown) => p.l(field?.options.find((o) => o.value === v)?.label) || String(v);
  switch (field?.type) {
    case 'number':
      return typeof value === 'number' ? p.formatNumber(value) : String(value);
    case 'price':
      return typeof value === 'number' ? p.formatMoney(value, item.availability?.currency ?? collection?.commerce.currency ?? 'IRR') : '';
    case 'date':
    case 'datetime':
      return formatDay(String(value), p.locale, cal, field.type === 'datetime');
    case 'boolean':
      return value ? p.m.collections.yes : p.m.collections.no;
    case 'select':
      return optionLabel(value);
    case 'multiselect':
      return Array.isArray(value) ? value.map(optionLabel).join('، ') : '';
    case 'reference': {
      const list = (Array.isArray(value) ? value : [value]) as { title?: Loc }[];
      return list.map((r) => p.l(r?.title)).filter(Boolean).join('، ');
    }
    case 'image':
    case 'gallery':
      return '';
  }
  if (isLoc(value)) return p.l(value);
  return typeof value === 'object' ? '' : String(value);
}

/** Replaces `{{key}}` in a text with the item's values. */
export function fillTokens(text: string, item: PublicItem, collection: PublicCollection | undefined, p: Prefs, cal?: CalendarSystem): string {
  return text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, key: string) => formatFieldValue(item, collection, key, p, cal));
}

const urlOf = (v: unknown): string | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as { url?: string; imageUrl?: string | null };
  return o.url ?? o.imageUrl ?? null;
};

/**
 * Images of the item for an image block: the main image (''), every image field ('*'), or one
 * field (an image, a gallery, or referenced items' images).
 */
function imagesOf(item: PublicItem, collection: PublicCollection | undefined, key: string): string[] {
  if (!key) return item.imageUrl ? [item.imageUrl] : [];
  const keys = key === '*' ? (collection?.fields ?? []).filter((f) => f.type === 'image' || f.type === 'gallery').map((f) => f.key) : [key];
  return keys.flatMap((k) => {
    const v = item.data[k];
    return (Array.isArray(v) ? v : [v]).map(urlOf).filter((u): u is string => !!u);
  });
}

/** The images a block shows: the first, all, or picked ones ("1,3"), at most `count`. */
function chooseImages(all: string[], block: CardBlock): string[] {
  let list = all;
  if (block.images === 'first') list = all.slice(0, 1);
  if (block.images === 'pick') {
    const picked = block.pick
      .split(/[,،\s]+/)
      .map((x) => Number(x.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= all.length);
    list = picked.map((n) => all[n - 1]);
  }
  return block.count > 0 ? list.slice(0, block.count) : list;
}

const space = (n: number) => `${n * 0.25}rem`;
const widthClass: Record<CardBlock['width'], string> = {
  auto: '',
  full: 'w-full',
  '1/4': 'basis-1/4',
  '1/3': 'basis-1/3',
  '1/2': 'basis-1/2',
  '2/3': 'basis-2/3',
  '3/4': 'basis-3/4',
};
const ratioClass: Record<CardBlock['ratio'], string> = {
  auto: '',
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
  landscape: 'aspect-[4/3]',
  wide: 'aspect-[16/9]',
};
const styleClass: Record<CardBlock['textStyle'], string> = {
  title: 'font-display text-ink',
  subtitle: 'text-ink',
  body: 'text-ink-soft leading-relaxed',
  small: 'text-ink-soft',
  eyebrow: 'eyebrow',
};
const sizeClass: Record<CardBlock['textStyle'], Record<CardBlock['size'], string>> = {
  title: { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl', xl: 'text-4xl' },
  subtitle: { sm: 'text-sm', md: 'text-base', lg: 'text-lg', xl: 'text-xl' },
  body: { sm: 'text-sm', md: 'text-base', lg: 'text-lg', xl: 'text-xl' },
  small: { sm: 'text-xs', md: 'text-sm', lg: 'text-base', xl: 'text-lg' },
  eyebrow: { sm: '', md: '', lg: '', xl: '' },
};
const weightClass = { normal: '', medium: 'font-medium', bold: 'font-bold' };
// `start` follows the surrounding row/column, so a box can be aligned once for all its texts.
const alignClass = { start: '', center: 'text-center', end: 'text-end', right: 'text-right', left: 'text-left' };
const objectPosition = { center: 'center', top: 'top', bottom: 'bottom', left: 'left', right: 'right' };
const gridCols = ['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5', 'grid-cols-6'];
const flexAlign = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' };
const flexJustify = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' };
const buttonVariant = {
  primary: 'bg-ink text-bg hover:bg-accent hover:text-accent-ink',
  secondary: 'border border-ink/30 text-ink hover:border-ink hover:bg-ink hover:text-bg',
  link: 'text-ink underline-offset-8 decoration-accent hover:underline',
};

interface ViewProps {
  block: CardBlock;
  item: PublicItem;
  collection: PublicCollection | undefined;
  /** Builder preview: links and buttons do nothing. */
  inert?: boolean;
  /** Designer: the selected block is outlined and clicking a block selects it. */
  selected?: string;
  onSelect?: (id: string) => void;
}

/** Draws one item with a box design. */
export function CardView(props: ViewProps) {
  return <BlockView {...props} />;
}

function BlockView({ block, item, collection, inert, selected, onSelect }: ViewProps): ReactNode {
  const p = usePreferences();
  const cal = useSiteCalendar();
  const pick = onSelect
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(block.id);
      }
    : undefined;
  const mark = cn(onSelect && 'cursor-pointer outline-offset-2 hover:outline hover:outline-1 hover:outline-accent/50', selected === block.id && 'outline outline-2 outline-accent');
  const common = cn(widthClass[block.width], mark);

  const text = (): string => {
    const value = block.source === 'static' ? fillTokens(p.l(block.text), item, collection, p, cal) : formatFieldValue(item, collection, block.field, p, cal);
    const label = p.l(block.label) || p.l(collection?.fields.find((f) => f.key === block.field)?.label);
    return value && block.showLabel && label ? `${label}: ${value}` : value;
  };
  const textLook = cn(
    styleClass[block.textStyle],
    sizeClass[block.textStyle][block.size],
    weightClass[block.weight],
    alignClass[block.textAlign],
    block.lines > 0 && 'overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical]',
  );
  const textStyle: CSSProperties = { ...(block.color ? { color: block.color } : {}), ...(block.lines > 0 ? { WebkitLineClamp: block.lines } : {}) };

  switch (block.type) {
    case 'stack': {
      const style: CSSProperties = {
        gap: space(block.gap),
        padding: space(block.padding),
        borderRadius: block.radius ? `${block.radius}px` : undefined,
        background: block.background || undefined,
      };
      const className = cn(
        'flex min-w-0 overflow-hidden',
        alignClass[block.textAlign],
        block.direction === 'row' ? 'flex-row' : 'flex-col',
        block.wrap && 'flex-wrap',
        flexAlign[block.align],
        flexJustify[block.justify],
        block.border && 'border border-line',
        block.shadow && 'shadow-md',
        common,
      );
      const children = block.children.map((c) => <BlockView key={c.id} block={c} item={item} collection={collection} inert={inert} selected={selected} onSelect={onSelect} />);
      const dir = block.dir === 'auto' ? undefined : block.dir;
      if (block.linkToItem && !inert && !onSelect)
        return (
          <Link to={itemHref(item)} dir={dir} className={cn(className, 'transition-opacity hover:opacity-90')} style={style}>
            {children}
          </Link>
        );
      return (
        <div className={className} style={style} dir={dir} onClick={pick}>
          {children}
        </div>
      );
    }
    case 'image': {
      const urls = chooseImages(imagesOf(item, collection, block.field), block);
      // One frame per image: fixed pixels when set, else the width of its place and the chosen shape.
      const frame = (url: string | null, key: number | string) => (
        <div
          key={key}
          className={cn('shrink-0 overflow-hidden bg-surface-2', !block.imgHeight && ratioClass[block.ratio], !block.imgWidth && 'w-full')}
          style={{ borderRadius: block.radius ? `${block.radius}px` : undefined, width: block.imgWidth ? `${block.imgWidth}px` : undefined, height: block.imgHeight ? `${block.imgHeight}px` : undefined, maxWidth: '100%' }}
        >
          {url ? (
            <img src={url} alt="" loading="lazy" className="h-full w-full" style={{ objectFit: block.fit, objectPosition: objectPosition[block.position] }} />
          ) : (
            <div className="h-full min-h-24 w-full" />
          )}
        </div>
      );
      if (urls.length <= 1)
        return (
          <div className={common} onClick={pick}>
            {frame(urls[0] ?? null, 0)}
          </div>
        );
      if (block.display === 'slider') return <ImageSlider urls={urls} frame={frame} className={common} onClick={pick} />;
      return (
        <div
          className={cn(
            block.display === 'grid' && cn('grid', gridCols[block.columns]),
            block.display === 'row' && 'flex snap-x overflow-x-auto [&>*]:snap-start',
            block.display === 'stack' && 'flex flex-col',
            common,
          )}
          style={{ gap: space(block.gap) }}
          onClick={pick}
        >
          {urls.map((u, i) => frame(u, i))}
        </div>
      );
    }
    case 'text': {
      const value = text();
      if (!value && !onSelect) return null;
      return (
        <p className={cn(textLook, 'whitespace-pre-line', common)} style={textStyle} onClick={pick}>
          {value || <span className="opacity-40">{block.field || '…'}</span>}
        </p>
      );
    }
    case 'badge': {
      const value = text();
      if (!value && !onSelect) return null;
      return (
        <span
          className={cn('inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium', !block.background && 'bg-accent-soft text-ink', common)}
          style={{ background: block.background || undefined, color: block.color || undefined }}
          onClick={pick}
        >
          {value || '…'}
        </span>
      );
    }
    case 'price': {
      const a = item.availability;
      if (!a || a.finalPriceMinor === null) return onSelect ? <span className={cn('text-ink-soft', common)} onClick={pick}>—</span> : null;
      return (
        <p className={cn('flex flex-wrap items-baseline gap-2', textLook, common)} style={textStyle} onClick={pick}>
          <span>{p.formatMoney(a.finalPriceMinor, a.currency)}</span>
          {a.discountPercent > 0 && a.priceMinor !== null && <span className="text-sm text-ink-soft line-through">{p.formatMoney(a.priceMinor, a.currency)}</span>}
        </p>
      );
    }
    case 'capacity': {
      const a = item.availability;
      const label = !a ? '' : a.reason === 'deadline' ? p.m.collections.closed : a.reason === 'full' ? p.m.collections.full : a.remaining !== null ? p.format(p.m.collections.seatsLeft, { count: p.formatNumber(a.remaining) }) : '';
      if (!label && !onSelect) return null;
      return (
        <p className={cn(textLook, a?.closed && 'text-accent', common)} style={textStyle} onClick={pick}>
          {label || '—'}
        </p>
      );
    }
    case 'divider':
      return <hr className={cn('border-line', common)} onClick={pick} />;
    case 'spacer':
      return <div className={common} style={{ height: `${block.height}px` }} onClick={pick} />;
    case 'button':
      return <CardButton block={block} item={item} collection={collection} inert={inert || !!onSelect} className={common} onClick={pick} />;
  }
}

/** Several images one at a time, with previous / next buttons and dots. */
function ImageSlider({ urls, frame, className, onClick }: { urls: string[]; frame: (url: string, key: number) => ReactNode; className: string; onClick?: (e: React.MouseEvent) => void }) {
  const [index, setIndex] = useState(0);
  const go = (d: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex((i) => (i + d + urls.length) % urls.length);
  };
  return (
    <div className={cn('relative', className)} onClick={onClick}>
      {frame(urls[index], index)}
      <button type="button" aria-label="previous" onClick={go(-1)} className="absolute start-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-bg/80 text-ink shadow">
        &lsaquo;
      </button>
      <button type="button" aria-label="next" onClick={go(1)} className="absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-bg/80 text-ink shadow">
        &rsaquo;
      </button>
      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {urls.map((_, i) => (
          <span key={i} className={cn('size-1.5 rounded-full', i === index ? 'bg-white' : 'bg-white/50')} />
        ))}
      </div>
    </div>
  );
}

function CardButton({ block, item, collection, inert, className, onClick }: { block: CardBlock; item: PublicItem; collection: PublicCollection | undefined; inert?: boolean; className: string; onClick?: (e: React.MouseEvent) => void }) {
  const p = usePreferences();
  const cart = useCartOptional();
  const { data: settings } = useSiteSettings();
  const [added, setAdded] = useState(false);
  const look = cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition duration-300 disabled:pointer-events-none disabled:opacity-50',
    block.variant !== 'link' && 'rounded-full px-5 py-2.5',
    buttonVariant[block.variant],
    block.width === 'full' && 'w-full',
    className,
  );
  const label = p.l(block.label);
  const a = item.availability;

  if (block.action === 'cart') {
    const reason = !a ? '' : a.reason === 'deadline' ? p.m.collections.closed : a.reason === 'full' ? (item.collection === 'products' ? p.m.shop.soldOut : p.m.collections.full) : '';
    const canBuy = !!a?.canBuy && !!settings?.modules.orders && (item.collection !== 'products' || !!settings.modules.products);
    if (added && cart)
      return (
        <Link to="/cart" className={look}>
          {p.m.shop.viewCart}
        </Link>
      );
    return (
      <button
        type="button"
        className={look}
        disabled={!inert && !canBuy}
        onClick={(e) => {
          if (onClick) return onClick(e);
          if (!cart || !a || a.finalPriceMinor === null) return;
          cart.add({
            productId: item.id,
            ...(item.collection !== 'products' ? { kind: 'item' as const, href: itemHref(item), max: Math.min(collection?.commerce.maxPerOrder ?? 10, a.remaining ?? 999) } : {}),
            slug: item.slug,
            name: item.title,
            priceMinor: String(a.finalPriceMinor),
            currency: a.currency,
            imageUrl: item.imageUrl,
          });
          setAdded(true);
        }}
      >
        {reason || label || p.m.shop.addToCart}
      </button>
    );
  }

  let href = '';
  if (block.action === 'view') href = itemHref(item);
  if (block.action === 'request') {
    const type = block.requestType || collection?.requestType || '';
    const qs = new URLSearchParams({ ...(type ? { type } : {}), item: `${item.collection}/${item.slug}` });
    href = `${block.href || '/contact'}?${qs}`;
    if (a?.closed && !inert)
      return (
        <button type="button" className={look} disabled>
          {a.reason === 'deadline' ? p.m.collections.closed : p.m.collections.full}
        </button>
      );
  }
  if (block.action === 'link' || block.action === 'call') {
    const fromField = block.source === 'field' && block.field ? item.data[block.field] : null;
    href = typeof fromField === 'string' ? fromField : block.href;
    if (block.action === 'call' && href && !/^tel:/i.test(href)) href = `tel:${href.replace(/\s/g, '')}`;
    const field = collection?.fields.find((f) => f.key === block.field);
    if (field?.type === 'email' && href && !/^mailto:/i.test(href)) href = `mailto:${href}`;
  }
  const text = label || (block.action === 'view' ? p.m.collections.view : block.action === 'request' ? p.m.collections.request : href);
  if (inert || !href)
    return (
      <span className={look} onClick={onClick}>
        {text}
      </span>
    );
  if (href.startsWith('/') && !block.newTab)
    return (
      <Link to={href} className={look}>
        {text}
      </Link>
    );
  return (
    <a href={href} className={look} {...(block.newTab || /^https?:/i.test(href) ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
      {text}
    </a>
  );
}
