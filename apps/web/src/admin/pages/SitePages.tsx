import { lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { useAdminSettings } from '../AdminRoot';
import { OPERATOR_UI, useIsOperator } from '../auth';
import { Spinner } from '../ui';

// Dashboard and pages (site building) are operator-only and left out of client builds.
const Dashboard = OPERATOR_UI ? lazy(() => import('./DashboardPage')) : null;
const PagesList = OPERATOR_UI ? lazy(() => import('./PagesListPage')) : null;
const Catalog = lazy(() => import('./CatalogPages'));
const Inbox = lazy(() => import('./InboxPages'));
const Files = lazy(() => import('./FilesPage'));
const Settings = lazy(() => import('./SettingsPages'));
const Content = lazy(() => import('./ContentPages'));
// Defining tables is building the site; their items are the owner's content.
const Tables = OPERATOR_UI ? lazy(() => import('../collections/TablesPage')) : null;
const Items = lazy(() => import('../collections/ItemsPage'));

/** A client's admin opens on its first data section. */
function ClientHome({ siteId }: { siteId: string }) {
  const { data: settings } = useAdminSettings(siteId);
  if (!settings) return <Spinner />;
  const m = settings.modules;
  return <Navigate to={m.products ? 'products' : m.services ? 'services' : m.leads ? 'leads' : 'files'} replace />;
}

export default function SitePages({ account = false }: { account?: boolean }) {
  const { siteId = '' } = useParams();
  const operator = useIsOperator();
  if (account) return <Settings siteId="" view="account" />;
  return (
    <Routes>
      <Route index element={operator && Dashboard ? <Dashboard siteId={siteId} /> : <ClientHome siteId={siteId} />} />
      {operator && PagesList && <Route path="pages" element={<PagesList siteId={siteId} />} />}
      <Route path="content/*" element={<Content siteId={siteId} />} />
      <Route path="services" element={<Catalog siteId={siteId} kind="services" />} />
      <Route path="products" element={<Catalog siteId={siteId} kind="products" />} />
      {operator && Tables && <Route path="tables" element={<Tables siteId={siteId} />} />}
      <Route path="items/:collectionId" element={<Items siteId={siteId} />} />
      <Route path="leads" element={<Inbox siteId={siteId} kind="leads" />} />
      <Route path="orders" element={<Inbox siteId={siteId} kind="orders" />} />
      <Route path="files" element={<Files siteId={siteId} />} />
      <Route path="members" element={<Settings siteId={siteId} view="members" />} />
      <Route path="settings" element={<Settings siteId={siteId} view="settings" />} />
      <Route path="payments" element={<Settings siteId={siteId} view="payments" />} />
      <Route path="*" element={<Navigate to={`/admin/sites/${siteId}`} replace />} />
    </Routes>
  );
}
