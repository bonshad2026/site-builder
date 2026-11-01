import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { FieldShell, TextArea, TextInput } from '../../../components/ui/Field';
import { Container, Section } from '../../../components/ui/Layout';
import { api, apiAvailable } from '../../../lib/api';
import { errorLine } from '../../../lib/errorText';
import { usePreferences } from '../../../lib/preferences';
import { useSiteErrorLanguage, useSiteId } from '../data';

interface Reviews {
  average: number;
  count: number;
  reviews: { name: string; rating: number; text: string; createdAt: string }[];
}

const Stars = ({ value, label }: { value: number; label: string }) => (
  <span role="img" aria-label={label} className="text-accent">
    {'★'.repeat(Math.round(value))}
    <span className="text-line">{'★'.repeat(5 - Math.round(value))}</span>
  </span>
);

/** A product's approved reviews with the average, and a form to send one (shown after the staff approve it). */
export function ProductReviews({ slug }: { slug: string }) {
  const { m, formatNumber, formatDate } = usePreferences();
  const site = useSiteId();
  const qc = useQueryClient();
  const errorLang = useSiteErrorLanguage();
  const data = useQuery({ queryKey: ['public', site, 'reviews', slug], queryFn: () => api.get<Reviews>(`/public/sites/${site}/products/${slug}/reviews`), enabled: apiAvailable() });
  const [form, setForm] = useState({ name: '', rating: 5, text: '', website: '' });
  const [sent, setSent] = useState(false);
  const send = useMutation({
    mutationFn: () => api.post(`/public/sites/${site}/products/${slug}/reviews`, form),
    onSuccess: () => {
      setSent(true);
      qc.invalidateQueries({ queryKey: ['public', site, 'reviews', slug] });
    },
  });
  if (!apiAvailable()) return null;
  const r = data.data;
  return (
    <Section>
      <Container className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 className="font-display text-3xl text-ink sm:text-4xl">{m.shop.reviews}</h2>
          {r && r.count > 0 && (
            <p className="mt-3 flex items-center gap-3 text-ink-soft">
              <Stars value={r.average} label={`${formatNumber(r.average)} / ${formatNumber(5)}`} /> {formatNumber(r.average)} · {formatNumber(r.count)}
            </p>
          )}
          <ul className="mt-8 divide-y divide-line">
            {r?.reviews.map((x, i) => (
              <li key={i} className="py-5">
                <p className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-ink">{x.name}</span>
                  <Stars value={x.rating} label={`${formatNumber(x.rating)} / ${formatNumber(5)}`} />
                  <span className="text-ink-soft">{formatDate(x.createdAt)}</span>
                </p>
                {x.text && <p className="mt-2 leading-relaxed text-ink-soft">{x.text}</p>}
              </li>
            ))}
          </ul>
          {r && !r.count && <p className="mt-6 text-ink-soft">{m.shop.noReviews}</p>}
        </div>
        <div className="lg:col-span-4 lg:col-start-9">
          <h3 className="text-lg text-ink">{m.shop.writeReview}</h3>
          {sent ? (
            <p role="status" className="mt-4 text-ink">
              {m.shop.reviewSent}
            </p>
          ) : (
            <form
              className="mt-4 flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <FieldShell id="rv-name" label={m.shop.yourName}>
                <TextInput id="rv-name" required minLength={2} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </FieldShell>
              <fieldset>
                <legend className="mb-2 text-sm text-ink-soft">{m.shop.rating}</legend>
                <div className="flex gap-1" dir="ltr">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" aria-pressed={form.rating === n} aria-label={`${formatNumber(n)}`} onClick={() => setForm((f) => ({ ...f, rating: n }))} className={n <= form.rating ? 'text-2xl text-accent' : 'text-2xl text-line'}>
                      ★
                    </button>
                  ))}
                </div>
              </fieldset>
              <FieldShell id="rv-text" label={m.shop.yourReview}>
                <TextArea id="rv-text" rows={4} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
              </FieldShell>
              {/* Honeypot: people never see or fill it. */}
              <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
              {send.error && <p className="text-sm text-danger">{errorLine(send.error, errorLang)}</p>}
              <Button type="submit" disabled={send.isPending}>
                {m.shop.sendReview}
              </Button>
            </form>
          )}
        </div>
      </Container>
    </Section>
  );
}
