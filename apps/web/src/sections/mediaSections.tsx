import type { SectionProps } from '@site-builder/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { TextInput } from '../components/ui/Field';
import { Container, Section, SectionHeading } from '../components/ui/Layout';
import { useLocation } from 'react-router';
import { useSiteErrorLanguage, useSiteId } from '../features/public-site/data';
import { api, apiAvailable } from '../lib/api';
import { cn } from '../lib/cn';
import { errorLine } from '../lib/errorText';
import { usePreferences } from '../lib/preferences';

type Props<T extends 'map' | 'video' | 'newsletter'> = { props: SectionProps<T> };

/* ---------- map ---------- */

/** OpenStreetMap around a point (no key needed). */
const osmEmbed = (lat: number, lng: number, zoom: number) => {
  const d = 0.6 / 2 ** (zoom - 10);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d / 2},${lng + d},${lat + d / 2}&layer=mapnik&marker=${lat},${lng}`;
};

/** A map: an embed address (Neshan, Google Maps…) or a point on OpenStreetMap, with "directions" links. */
export function MapSection({ props }: Props<'map'>) {
  const { l, locale } = usePreferences();
  const point = props.lat !== null && props.lng !== null;
  const src = props.embedUrl || (point ? osmEmbed(props.lat!, props.lng!, props.zoom) : '');
  if (!src) return null;
  return (
    <Section>
      <Container>
        {(l(props.heading) || l(props.eyebrow)) && <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} intro={l(props.address)} />}
        <iframe title={l(props.heading) || 'map'} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="w-full rounded-lg border border-line" style={{ height: props.height }} />
        {point && (
          <p className="mt-4 flex flex-wrap gap-4 text-sm">
            <a className="underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`https://neshan.org/maps/@${props.lat},${props.lng},16z`}>
              {locale === 'fa' ? 'مسیریابی با نشان' : 'Directions (Neshan)'}
            </a>
            <a className="underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`https://balad.ir/location?latitude=${props.lat}&longitude=${props.lng}`}>
              {locale === 'fa' ? 'مسیریابی با بلد' : 'Directions (Balad)'}
            </a>
            <a className="underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${props.lat},${props.lng}`}>
              {locale === 'fa' ? 'گوگل مپ' : 'Google Maps'}
            </a>
          </p>
        )}
      </Container>
    </Section>
  );
}

/* ---------- video ---------- */

/** An embeddable player address for Aparat, YouTube or Vimeo links; null for a video file. */
export function videoEmbed(url: string, autoplay: boolean): string | null {
  const a = url.match(/aparat\.com\/(?:v|video\/video\/embed\/videohash)\/([A-Za-z0-9]+)/);
  if (a) return `https://www.aparat.com/video/video/embed/videohash/${a[1]}/vt/frame${autoplay ? '?autoplay=true' : ''}`;
  const y = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (y) return `https://www.youtube-nocookie.com/embed/${y[1]}${autoplay ? '?autoplay=1&mute=1' : ''}`;
  const v = url.match(/vimeo\.com\/(\d+)/);
  if (v) return `https://player.vimeo.com/video/${v[1]}${autoplay ? '?autoplay=1&muted=1' : ''}`;
  return null;
}

const RATIO = { '16:9': 'aspect-video', '4:3': 'aspect-[4/3]', '1:1': 'aspect-square', '9:16': 'aspect-[9/16] max-w-sm mx-auto' };

export function VideoSection({ props }: Props<'video'>) {
  const { l } = usePreferences();
  if (!props.url) return null;
  const embed = videoEmbed(props.url, props.autoplay);
  return (
    <Section>
      <Container>
        {(l(props.heading) || l(props.eyebrow)) && <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} intro={l(props.intro)} />}
        <div className={cn('w-full overflow-hidden rounded-lg bg-black', RATIO[props.ratio])}>
          {embed ? (
            <iframe title={l(props.heading) || 'video'} src={embed} loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full" />
          ) : (
            <video src={props.url} poster={props.posterUrl || undefined} controls autoPlay={props.autoplay} muted={props.autoplay} playsInline className="h-full w-full object-contain" />
          )}
        </div>
      </Container>
    </Section>
  );
}

/* ---------- newsletter ---------- */

export function NewsletterSection({ props }: Props<'newsletter'>) {
  const { l, m } = usePreferences();
  const site = useSiteId();
  const { pathname } = useLocation();
  const errorLang = useSiteErrorLanguage();
  const [contact, setContact] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const join = useMutation({ mutationFn: () => api.post(`/public/sites/${site}/subscribe`, { contact, name, website, sourcePath: pathname }) });
  const dark = props.tone === 'dark';
  return (
    <Section className={cn(dark && 'bg-ink text-bg')}>
      <Container className="flex flex-col items-center gap-6 text-center">
        {(l(props.heading) || l(props.eyebrow)) && <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} intro={l(props.intro)} align="center" />}
        {join.isSuccess ? (
          <p role="status" className="text-lg">
            {l(props.successText) || '✓'}
          </p>
        ) : (
          <form
            className="flex w-full max-w-xl flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (apiAvailable() && contact.trim()) join.mutate();
            }}
          >
            {props.askName && <TextInput aria-label={m.form.name} placeholder={m.form.name} value={name} onChange={(e) => setName(e.target.value)} className="sm:w-40" />}
            <TextInput aria-label={l(props.placeholder) || 'email'} placeholder={l(props.placeholder)} dir="ltr" required value={contact} onChange={(e) => setContact(e.target.value)} className="flex-1" />
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
            <Button type="submit" disabled={join.isPending}>
              {l(props.buttonLabel) || '→'}
            </Button>
          </form>
        )}
        {join.error && <p className="text-sm text-danger">{errorLine(join.error, errorLang)}</p>}
      </Container>
    </Section>
  );
}
