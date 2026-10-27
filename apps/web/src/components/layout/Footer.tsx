import { Link } from 'react-router';
import { useSiteSettings } from '../../features/public-site/data';
import { apiAvailable } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { Container } from '../ui/Layout';
import { useNavItems } from './nav';

export function Footer() {
  const { m, l, formatNumber } = usePreferences();
  const { data: settings } = useSiteSettings();
  const nav = useNavItems();
  if (!settings) return null;
  const { contact, social } = settings;

  return (
    <footer className="border-t border-line bg-surface">
      <Container className="grid gap-14 py-20 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="font-display text-4xl text-ink">{l(settings.name)}</p>
          {l(settings.tagline) && <p className="mt-4 max-w-sm leading-relaxed text-ink-soft">{l(settings.tagline)}</p>}
          <ul className="mt-8 flex flex-wrap gap-6 text-sm">
            {social.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noreferrer noopener" className="text-ink-soft transition-colors hover:text-accent">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Footer" className="md:col-span-3">
          <ul className="grid grid-cols-2 gap-y-3 text-sm md:grid-cols-1">
            {[...nav, { to: '/contact', label: m.nav.contact }].map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="text-ink-soft transition-colors hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

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
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-col gap-2 py-6 text-xs text-ink-soft sm:flex-row sm:justify-between">
          <p>
            © {formatNumber(new Date().getFullYear())} {l(settings.name)}. {m.footer.rights}
          </p>
          {!apiAvailable() && <p>{m.footer.demo}</p>}
        </Container>
      </div>
    </footer>
  );
}
