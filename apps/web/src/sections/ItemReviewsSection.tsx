import type { SectionProps } from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/ui/Button';
import { TextArea } from '../components/ui/Field';
import { Container, Section, SectionHeading } from '../components/ui/Layout';
import { customerRequest, L, useCustomer, useText } from '../features/account/customerApi';
import { Stars } from '../features/collections/CardView';
import { useCurrentItem } from '../features/collections/data';
import { useSiteErrorLanguage, useSiteId } from '../features/public-site/data';
import { apiAvailable } from '../lib/api';
import { cn } from '../lib/cn';
import { errorLine } from '../lib/errorText';
import { usePreferences } from '../lib/preferences';

interface ReviewsData {
  average: number;
  count: number;
  afterDoneRequest: boolean;
  reviews: { id: string; authorName: string; rating: number; body: string; createdAt: string }[];
  mine: { signedIn: boolean; canReview: boolean; leads: { id: string; code: string }[] };
}

/** Five buttons to choose a rating (keyboard: arrows move between them). */
function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useText();
  return (
    <div role="radiogroup" aria-label={t(L('Your rating', 'امتیاز شما'))} dir="ltr" className="flex gap-1 text-3xl">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}`}
          onClick={() => onChange(n)}
          className={cn('leading-none transition', n <= value ? 'text-amber-500' : 'text-ink/20 hover:text-amber-300')}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/**
 * Ratings and comments of the item whose page this is: the average and count, the latest
 * comments, and a form for a customer who may review it (after their finished request, when the
 * table asks for that). The server decides who may review; this only shows what it says.
 */
export function ItemReviewsSection({ props }: { props: SectionProps<'item-reviews'> }) {
  const p = usePreferences();
  const t = useText();
  const site = useSiteId();
  const qc = useQueryClient();
  const errLang = useSiteErrorLanguage();
  const current = useCurrentItem();
  const { enabled: accounts } = useCustomer();
  const item = current?.item;
  const path = item ? `/collections/${item.collection}/items/${item.slug}/reviews` : '';
  const key = ['public', site, 'reviews', path];
  const { data } = useQuery({ queryKey: key, queryFn: () => customerRequest<ReviewsData>(site, `${path}?limit=${props.limit}`), enabled: !!item && apiAvailable() && !!current?.collection.reviews?.enabled });
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [leadId, setLeadId] = useState('');
  const send = useMutation({
    mutationFn: () => customerRequest(site, path, { method: 'POST', body: { rating, body, ...(leadId || data?.mine.leads[0] ? { leadId: leadId || data!.mine.leads[0].id } : {}) } }),
    onSuccess: () => {
      setRating(0);
      setBody('');
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['public', site, 'collections'] });
    },
  });
  if (!item || !current?.collection.reviews?.enabled) return null;
  const reviews = data?.reviews ?? [];

  return (
    <Section>
      <Container className="max-w-4xl">
        {(p.l(props.heading) || p.l(props.eyebrow)) && <SectionHeading eyebrow={p.l(props.eyebrow)} title={p.l(props.heading)} intro={p.l(props.intro)} />}
        <div className="flex flex-wrap items-center gap-4 border-b border-line pb-6">
          <span className="font-display text-5xl text-ink">{data && data.count > 0 ? p.formatNumber(data.average) : '—'}</span>
          <div className="flex flex-col gap-1">
            <Stars value={data?.average ?? 0} className="text-2xl" />
            <span className="text-sm text-ink-soft">{data && data.count > 0 ? p.format(p.m.collections.reviewCount, { count: p.formatNumber(data.count) }) : p.m.collections.noReviews}</span>
          </div>
        </div>

        <ul className="divide-y divide-line">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium text-ink">{r.authorName}</span>
                <span className="flex items-center gap-3 text-sm text-ink-soft">
                  <Stars value={r.rating} />
                  {p.formatDate(r.createdAt)}
                </span>
              </div>
              {r.body && <p className="leading-relaxed text-ink-soft">{r.body}</p>}
            </li>
          ))}
        </ul>

        {props.showForm && data && (
          <div className="mt-6 rounded-xl border border-line bg-surface p-6 sm:p-8">
            {data.mine.canReview ? (
              send.isSuccess ? (
                <p role="status" className="text-ink">
                  {t(L('Thank you, your review was saved.', 'سپاس؛ نظر شما ثبت شد.'))}
                </p>
              ) : (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (rating) send.mutate();
                  }}
                >
                  <h3 className="font-display text-2xl text-ink">{t(L('Your rating', 'امتیاز و نظر شما'))}</h3>
                  {data.mine.leads.length > 1 && (
                    <label className="flex flex-col gap-1 text-sm">
                      {t(L('About request', 'درباره‌ی درخواست'))}
                      <select value={leadId || data.mine.leads[0].id} onChange={(e) => setLeadId(e.target.value)} className="w-fit rounded-md border border-line bg-bg px-3 py-2" dir="ltr">
                        {data.mine.leads.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.code}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <RatingInput value={rating} onChange={setRating} />
                  <TextArea rows={4} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t(L('Your comment (optional)', 'نظر شما (اختیاری)'))} aria-label={t(L('Comment', 'نظر'))} />
                  {send.error && <p className="text-sm text-danger">{errorLine(send.error, errLang)}</p>}
                  <Button type="submit" disabled={!rating || send.isPending} className="w-fit">
                    {t(L('Send review', 'ثبت نظر'))}
                  </Button>
                </form>
              )
            ) : (
              <p className="text-sm text-ink-soft">
                {data.afterDoneRequest
                  ? t(L('Customers whose request handled here is finished can rate it from here or from their request page.', 'مشتریانی که درخواستشان با این مورد انجام و تمام شده، می‌توانند این‌جا یا در صفحه‌ی درخواستشان امتیاز و نظر بدهند.'))
                  : t(L('Signed-in customers can rate it once.', 'مشتریان واردشده می‌توانند یک بار امتیاز بدهند.'))}{' '}
                {!data.mine.signedIn && accounts && (
                  <Link to={`/account?next=${encodeURIComponent(window.location.pathname)}`} className="text-ink underline underline-offset-4">
                    {t(L('Sign in', 'ورود'))}
                  </Link>
                )}
              </p>
            )}
          </div>
        )}
      </Container>
    </Section>
  );
}
