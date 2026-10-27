import { lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';

const Dashboard = lazy(() => import('./DashboardPage'));
const PagesList = lazy(() => import('./PagesListPage'));
const Catalog = lazy(() => import('./CatalogPages'));
const Inbox = lazy(() => import('./InboxPages'));
const Files = lazy(() => import('./FilesPage'));
const Settings = lazy(() => import('./SettingsPages'));

export default function SitePages({ account = false }: { account?: boolean }) {
  const { siteId = '' } = useParams();
  if (account) return <Settings siteId="" view="account" />;
  return (
    <Routes>
      <Route index element={<Dashboard siteId={siteId} />} />
      <Route path="pages" element={<PagesList siteId={siteId} />} />
      <Route path="services" element={<Catalog siteId={siteId} kind="services" />} />
      <Route path="products" element={<Catalog siteId={siteId} kind="products" />} />
      <Route path="leads" element={<Inbox siteId={siteId} kind="leads" />} />
      <Route path="orders" element={<Inbox siteId={siteId} kind="orders" />} />
      <Route path="files" element={<Files siteId={siteId} />} />
      <Route path="members" element={<Settings siteId={siteId} view="members" />} />
      <Route path="settings" element={<Settings siteId={siteId} view="settings" />} />
      <Route path="payments" element={<Settings siteId={siteId} view="payments" />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}
