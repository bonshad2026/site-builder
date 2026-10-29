import { Link } from 'react-router';
import { useSiteSettings } from '../../features/public-site/data';
import { apiAvailable } from '../../lib/api';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import { Container } from '../ui/Layout';
import { RichText, SmartLink } from '../ui/SmartLink';
import { SOCIAL_ICON_NAMES, SocialIcon } from '../ui/SocialIcon';
import { useNavItems } from './nav';

export function Footer() {
  const { m, l, formatNumber } = usePreferences();
  const { data: settings } = useSiteSettings();
  const nav = useNavItems();
  if (!settings) return null;
  const { contact, social } = settings;
  const display = settings.socialDisplay ?? 'label';
  const f = settings.footer;
  const columns = (f?.columns ?? []).filter((c) => l(c.title) || l(c.text) || c.links.length);
  const showBrand = f?.showBrand !== false;
  const showLogo = !!f?.showLogo && !!settings.logoUrl;
  const showTagline = f?.showTagline !== false;
  const showSocial = f?.showSocial !== false && social.length > 0;
  const showMenu = f?.showMenu !== false;
  const showContact = f?.showContact !== false;
  const hasContact = !!(l(contact.address) || contact.phone || contact.email || l(contact.hours));

  return (
    <footer className="border-t border-line bg-surface">
      <Container className="grid gap-14 py-20 md:grid-cols-12">
        {(showLogo || showBrand || showTagline || showSocial) && (
          <div className="md:col-span-5">
            {showLogo && <img src={settings.logoUrl} alt={showBrand ? '' : l(settings.name)} className="mb-4 h-12 w-auto max-w-[220px] object-contain" />}
            {showBrand && <p className="font-display text-4xl text-ink">{l(settings.name)}</p>}
            {showTagline && l(settings.tagline) && <p className="mt-4 max-w-sm leading-relaxed text-ink-soft">{l(settings.tagline)}</p>}
            {showSocial && (
              <ul className={cn('mt-8 flex flex-wrap text-sm', display === 'icon' ? 'gap-3' : 'gap-6')}>
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
            )}
          </div>
        )}

        {showMenu && (
          <nav aria-label="Footer" className="md:col-span-3">
            <ul className="grid grid-cols-2 gap-y-3 text-sm md:grid-cols-1">
              {[...nav, ...(nav.some((n) => n.to === '/contact') ? [] : [{ to: '/contact', label: m.nav.contact }])].map((item) => (
                <li key={item.to}>
                  {item.to.startsWith('/') ? (
                    <Link to={item.to} className="text-ink-soft transition-colors hover:text-ink">
                      {item.label}
                    </Link>
                  ) : (
                    <SmartLink href={item.to} className="text-ink-soft transition-colors hover:text-ink">
                      {item.label}
                    </SmartLink>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}

        {showContact && hasContact && (
          <address className="space-y-3 text-sm not-italic text-ink-soft md:col-span-4">
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
        )}

        {columns.length > 0 && (
          <div className={cn('grid gap-10 sm:grid-cols-2 md:col-span-12', columns.length >= 3 && 'lg:grid-cols-3', columns.length >= 4 && 'xl:grid-cols-4')}>
            {columns.map((c, i) => (
              <div key={i}>
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
            ))}
          </div>
        )}
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-col gap-2 py-6 text-xs text-ink-soft sm:flex-row sm:justify-between">
          <p>{l(f?.copyright) || `© ${formatNumber(new Date().getFullYear())} ${l(settings.name)}. ${m.footer.rights}`}</p>
          {!apiAvailable() && <p>{m.footer.demo}</p>}
        </Container>
      </div>
    </footer>
  );
}
