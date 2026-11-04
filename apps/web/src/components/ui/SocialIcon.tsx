import type { SocialIcon as SocialIconName } from '@site-builder/shared';
import type { ReactNode } from 'react';

/** Simple line icons for social links, drawn in the current text colour. */
const paths: Record<SocialIconName, ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </>
  ),
  telegram: (
    <>
      <path d="M21.5 3.5 2.5 11l6.5 2.2L11.3 20l3.4-4.4 5 3.7 1.8-15.8Z" />
      <path d="m9 13.2 8.5-6.4" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.3 3.2Z" />
      <path d="M9 8.6c.2 3.4 3 6.2 6.4 6.4l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2Z" />
    </>
  ),
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M8 10.5V17M8 7.2v.1M12 17v-6.5M12 13.2a2.6 2.6 0 0 1 5 0V17" />
    </>
  ),
  x: (
    <>
      <path d="M4 4h4.5L20 20h-4.5Z" />
      <path d="M19.5 4 13.4 10.8M10.6 13.2 4.5 20" />
    </>
  ),
  facebook: <path d="M14.5 21v-7.5h2.8l.5-3.5h-3.3V8.2c0-1 .4-1.7 1.8-1.7h1.6V3.3a17 17 0 0 0-2.4-.2c-2.5 0-4.1 1.5-4.1 4.3V10H8.5v3.5h2.9V21" />,
  youtube: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="4" />
      <path d="m10 9 5 3-5 3Z" fill="currentColor" />
    </>
  ),
  aparat: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9" cy="8.5" r="1.8" />
      <circle cx="15.5" cy="9" r="1.8" />
      <circle cx="15" cy="15.5" r="1.8" />
      <circle cx="8.5" cy="15" r="1.8" />
    </>
  ),
  eitaa: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4h0.5A2.5 2.5 0 0 1 4 13.5Z" />
      <path d="M15 8.2a3 3 0 1 0 .3 3.6M9.2 9.6H15" />
    </>
  ),
  bale: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 1-4.3 15.8L3.5 20.5l1.2-4.1A8.5 8.5 0 0 1 12 3.5Z" />
      <path d="M9.5 7.5v7h3a2 2 0 0 0 0-4h-3" />
    </>
  ),
  rubika: (
    <>
      <path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4Z" />
      <path d="M12 7.5 16 9.8v4.4L12 16.5 8 14.2V9.8Z" />
    </>
  ),
  pinterest: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10.2 20.5 2-8.5M10.5 14.5c.6.5 1.3.8 2.1.8 2.2 0 3.6-2 3.6-4.4a4.3 4.3 0 0 0-4.5-4.2c-2.8 0-4.7 2-4.7 4.4 0 1 .4 2 1 2.5" />
    </>
  ),
  github: (
    <path d="M9 19c-4 1.3-4-2-5.6-2.4M14.6 21v-3.3a2.9 2.9 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.2 2.8 5.2 3.1 5.2 3.1a4.3 4.3 0 0 0-.1 3.2 4.7 4.7 0 0 0-1.3 3.2c0 4.7 2.8 5.7 5.5 6a2.9 2.9 0 0 0-.8 2.2V21" />
  ),
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>
  ),
  phone: <path d="M5 3.5h3.5l1.8 4.6-2.3 1.4a11 11 0 0 0 6.5 6.5l1.4-2.3 4.6 1.8V19a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.7a2 2 0 0 1 2-2.2Z" />,
  website: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
    </>
  ),
};

export const SOCIAL_ICON_NAMES: Record<SocialIconName, string> = {
  instagram: 'Instagram',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  x: 'X',
  facebook: 'Facebook',
  youtube: 'YouTube',
  aparat: 'Aparat',
  eitaa: 'Eitaa',
  bale: 'Bale',
  rubika: 'Rubika',
  pinterest: 'Pinterest',
  github: 'GitHub',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
};

/** Guesses the icon for a link from its address (instagram.com → instagram…). */
export function guessSocialIcon(href: string): SocialIconName | null {
  const h = href.toLowerCase();
  const map: [string, SocialIconName][] = [
    ['instagram.', 'instagram'],
    ['t.me', 'telegram'],
    ['telegram.', 'telegram'],
    ['wa.me', 'whatsapp'],
    ['whatsapp.', 'whatsapp'],
    ['linkedin.', 'linkedin'],
    ['x.com', 'x'],
    ['twitter.', 'x'],
    ['facebook.', 'facebook'],
    ['youtube.', 'youtube'],
    ['youtu.be', 'youtube'],
    ['aparat.', 'aparat'],
    ['eitaa.', 'eitaa'],
    ['ble.ir', 'bale'],
    ['bale.', 'bale'],
    ['rubika.', 'rubika'],
    ['pinterest.', 'pinterest'],
    ['github.', 'github'],
  ];
  return map.find(([needle]) => h.includes(needle))?.[1] ?? null;
}

export function SocialIcon({ name, className = 'size-5' }: { name: SocialIconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] ?? paths.website}
    </svg>
  );
}
