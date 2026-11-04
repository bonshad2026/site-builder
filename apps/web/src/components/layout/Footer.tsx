import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { useSiteSettings } from '../../features/public-site/data';
import { apiAvailable } from '../../lib/api';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import { Container } from '../ui/Layout';
import { RichText, SmartLink } from '../ui/SmartLink';
import { SOCIAL_ICON_NAMES, SocialIcon } from '../ui/SocialIcon';
import { useNavItems } from './nav';

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return to.startsWith('/') ? (
    <Link to={to} className="text-ink-soft transition-colors hover:text-ink">
      {children}
    </Link>
  ) : (
    <SmartLink href={to} className="text-ink-soft transition-colors hover:text-ink">
      {children}
    </SmartLink>
  );
}

type Block = { key: string; node: ReactNode; weight: number };

export function Footer() {
  const { m, l, formatNumber } = usePreferences();
  const { data: settings } = useSiteSettings();
  const nav = useNavItems();
  if (!settings) return null;
  const { contact, social } = settings;
  const display = settings.socialDisplay ?? 'label';
  const f = settings.footer;
  const columns = (f?.columns ?? []).filter((c) => l(c.title) || l(c.text) || c.links.length);
  const showSubmenu = f?.showSubmenu !== false;
  // Settings saved before placement existed have none: the original layout.
  const place = f?.placement ?? { brand: 1, social: 1, menu: 2, contact: 3 };
  const showBrand = f?.showBrand !== false;
  const showLogo = !!f?.showLogo && !!settings.logoUrl;
  const showTagline = f?.showTagline !== false;
  const showSocial = f?.showSocial !== false && social.length > 0;
  const showMenu = f?.showMenu !== false;
  const showContact = f?.showContact !== false;
  const hasContact = !!(l(contact.address) || contact.phone || contact.email || l(contact.hours));

  const showBrandBlock = showLogo || showBrand || (showTagline && !!l(settings.tagline));
  // Only the site's own menu items (a heading-only item needs its submenu to be shown).
  const menuItems = nav.filter((item) => item.to || (showSubmenu && item.children.length));
  const customColumn = (c: (typeof columns)[number], i: number) => (
    <div key={`col-${i}`}>
      {l(c.title) && <h2 className="eyebrow mb-4">{l(c.title)}</h2>}
      {l(c.text) && <RichText text={l(c.text)} className="text-sm leading-relaxed text-ink-soft" />}
      {c.links.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {c.links
            .filter((x) => l(x.label) && x.href)
            .map((x, j) => (
              <li key={j}>
                <SmartLink href={x.href} className="text-ink-soft transition-colors hover:text-ink">
                  {l(x.label)}
                </SmartLink>
              </li>
            ))}
        </ul>
      )}
    </div>
  );

  // Blocks per column (1–4); a column's width follows what it holds, so the default
  // (brand · menu · contact) keeps its original 5 : 3 : 4 proportions.
  const slots: Block[][] = Array.from({ length: 4 }, () => []);
  const put = (column: number, block: Block) => slots[Math.min(Math.max(column, 1), 4) - 1].push(block);

  if (showBrandBlock)
    put(place.brand, {
      key: 'brand',
      weight: 5,
      node: (
        <div key="brand">
          {showLogo && <img src={settings.logoUrl} alt={showBrand ? '' : l(settings.name)} className="mb-4 h-12 w-auto max-w-[220px] object-contain" />}
          {showBrand && <p className="font-display text-4xl text-ink">{l(settings.name)}</p>}
          {showTagline && l(settings.tagline) && <p className="mt-4 max-w-sm leading-relaxed text-ink-soft">{l(settings.tagline)}</p>}
        </div>
      ),
    });
  if (showSocial)
    put(place.social, {
      key: 'social',
      weight: 3,
      node: (
        <ul key="social" className={cn('flex flex-wrap text-sm', display === 'icon' ? 'gap-3' : 'gap-6')}>
          {social.map((s, i) => {
            const icon = s.icon ?? 'website';
            const name = s.label || SOCIAL_ICON_NAMES[icon];
            const withIcon = display !== 'label' || !s.label;
            return (
              <li key={i}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={display === 'icon' ? name : undefined}
                  title={display === 'icon' ? name : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 text-ink-soft transition-colors hover:text-accent',
                    display === 'icon' && 'rounded-full border border-line p-2.5 hover:border-accent',
                  )}
                >
                  {withIcon && <SocialIcon name={icon} />}
                  {display !== 'icon' && name}
                </a>
              </li>
            );
          })}
        </ul>
      ),
    });
  if (showMenu && menuItems.length)
    put(place.menu, {
      key: 'menu',
      weight: 3,
      node: (
        <nav key="menu" aria-label="Footer">
          <ul className="grid grid-cols-2 gap-y-3 text-sm md:grid-cols-1">
            {menuItems.map((item, i) => (
              <li key={i}>
                {item.to ? <FooterLink to={item.to}>{item.label}</FooterLink> : <span className="text-ink">{item.label}</span>}
                {showSubmenu && item.children.length > 0 && (
                  <ul className="ms-2 mt-3 space-y-2 border-s border-line ps-5">
                    {item.children.map((c, j) => (
                      <li key={j}>
                        <FooterLink to={c.to}>{c.label}</FooterLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ),
    });
  if (showContact && hasContact)
    put(place.contact, {
      key: 'contact',
      weight: 4,
      node: (
        <address key="contact" className="space-y-3 text-sm not-italic text-ink-soft">
          {l(contact.address) && <p>{l(contact.address)}</p>}
          {contact.phone && (
            <p>
              <a href={`tel:${contact.phone.replace(/\s/g, '')}`} dir="ltr" className="hover:text-ink">
                {contact.phone}
              </a>
            </p>
          )}
          {contact.email && (
            <p>
              <a href={`mailto:${contact.email}`} className="hover:text-ink">
                {contact.email}
              </a>
            </p>
          )}
          {l(contact.hours) && <p>{l(contact.hours)}</p>}
        </address>
      ),
    });
  columns.forEach((c, i) => {
    if (c.column) put(c.column, { key: `col-${i}`, weight: 3, node: customColumn(c, i) });
  });
  const bottomColumns = columns.map((c, i) => ({ c, i })).filter(({ c }) => !c.column);

  const used = slots.filter((s) => s.length);
  const template = used.map((s) => `${Math.max(...s.map((b) => b.weight))}fr`).join(' ');

  const year = formatNumber(new Date().getFullYear());
  const copyright = l(f?.copyright)
    ? l(f?.copyright).replaceAll('{year}', year).replaceAll('{name}', l(settings.name))
    : `© ${year} ${l(settings.name)}. ${m.footer.rights}`;
  const showCopyright = f?.showCopyright !== false;

  return (
    <footer className="border-t border-line bg-surface">
      <Container className="grid gap-14 py-20">
        {used.length > 0 && (
          <div className="grid gap-14 md:[grid-template-columns:var(--footer-cols)]" style={{ '--footer-cols': template } as CSSProperties}>
            {used.map((blocks, i) => (
              <div key={i} className="flex flex-col gap-8">
                {blocks.map((b) => b.node)}
              </div>
            ))}
          </div>
        )}

        {bottomColumns.length > 0 && (
          <div className={cn('grid gap-10 sm:grid-cols-2', bottomColumns.length >= 3 && 'lg:grid-cols-3', bottomColumns.length >= 4 && 'xl:grid-cols-4')}>
            {bottomColumns.map(({ c, i }) => customColumn(c, i))}
          </div>
        )}
      </Container>
      {(showCopyright || !apiAvailable()) && (
        <div className="border-t border-line">
          <Container className="flex flex-col gap-2 py-6 text-xs text-ink-soft sm:flex-row sm:justify-between">
            {showCopyright && <p>{copyright}</p>}
            {!apiAvailable() && <p>{m.footer.demo}</p>}
          </Container>
        </div>
      )}
    </footer>
  );
}
