import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useSiteInfo } from '../AdminRoot';
import { useT } from '../i18n';
import { Badge, Card, ErrorNote, PageTitle, Spinner } from '../ui';

interface Overview {
  content: { pages: number; publishedPages: number; pagesWithDrafts: number; products: number; services: number; files: number };
  leads: { new: number; total: number; recent: { id: string; name: string; type: string; status: string; createdAt: string }[] } | null;
  orders: {
    pending: number;
    total: number;
    paidRevenueMinor: string;
    testRevenueMinor: string;
    recent: { id: string; number: string; status: string; paymentStatus: string; totalMinor: string; createdAt: string }[];
  } | null;
}

export function Stat({ label, value, to }: { label: string; value: string | number; to?: string }) {
  const body = (
    <>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-2xl break-words text-ink sm:text-3xl">{value}</p>
    </>
  );
  return to ? (
    <Link to={to} className="block border border-line bg-surface p-5 hover:border-ink">
      {body}
    </Link>
  ) : (
    <div className="border border-line bg-surface p-5">{body}</div>
  );
}

export default function DashboardPage({ siteId }: { siteId: string }) {
  const t = useT();
  const { formatMoney, formatDate, formatNumber } = usePreferences();
  const { data: info } = useSiteInfo(siteId);
  const { data, isLoading, error } = useQuery({ queryKey: ['site', siteId, 'overview'], queryFn: () => api.get<Overview>(`/sites/${siteId}/overview`) });
  const base = `/admin/sites/${siteId}`;

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorNote error={error} />;

  return (
    <>
      <PageTitle title={info?.name ?? siteId} subtitle={t.dashboard} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t.publishedPages} value={`${formatNumber(data.content.publishedPages)} / ${formatNumber(data.content.pages)}`} to={`${base}/pages`} />
        <Stat label={t.unpublishedChanges} value={formatNumber(data.content.pagesWithDrafts)} to={`${base}/pages`} />
        {data.leads && <Stat label={t.newLeads} value={formatNumber(data.leads.new)} to={`${base}/leads`} />}
        {data.orders && <Stat label={t.pendingOrders} value={formatNumber(data.orders.pending)} to={`${base}/orders`} />}
        <Stat label={t.products} value={formatNumber(data.content.products)} to={`${base}/products`} />
        <Stat label={t.services} value={formatNumber(data.content.services)} to={`${base}/services`} />
        {data.orders && <Stat label={t.revenue} value={formatMoney(data.orders.paidRevenueMinor, 'IRR')} />}
        {data.orders && data.orders.testRevenueMinor !== '0' && <Stat label={t.testRevenue} value={formatMoney(data.orders.testRevenueMinor, 'IRR')} />}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {data.leads && (
          <Card title={t.recentLeads}>
            {data.leads.recent.length === 0 ? (
              <p className="text-sm text-ink-soft">{t.none}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {data.leads.recent.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link to={`${base}/leads?open=${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-ink-soft">
                      <Badge tone={l.status === 'new' ? 'accent' : 'neutral'}>{l.status}</Badge>
                      {formatDate(l.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {data.orders && (
          <Card title={t.recentOrders}>
            {data.orders.recent.length === 0 ? (
              <p className="text-sm text-ink-soft">{t.none}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {data.orders.recent.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link to={`${base}/orders?open=${o.id}`} className="font-medium hover:underline">
                      #{o.number}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-ink-soft">
                      <Badge>{o.status}</Badge>
                      <Badge tone={o.paymentStatus === 'paid' ? 'good' : o.paymentStatus === 'test_paid' ? 'warn' : 'neutral'}>{o.paymentStatus}</Badge>
                      {formatMoney(o.totalMinor, 'IRR')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
