import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { formFieldSchema } from '@site-builder/shared';
import { PreferencesProvider } from '../lib/preferences';
import { CustomRequestForm } from '../features/leads/CustomRequestForm';

vi.mock('../features/public-site/data', () => ({
  useSiteId: () => 'firefighter', DEFAULT_SITE_ID: 'firefighter',
  useSiteCalendar: () => 'gregorian', useSiteErrorLanguage: () => 'fa',
}));
vi.mock('../features/account/customerApi', async (original) => ({
  ...await original<typeof import('../features/account/customerApi')>(),
  useCustomer: () => ({ customer: null, enabled: false, loading: false }),
  customerRequest: vi.fn(async () => [
    { slug: 'rescue', title: { en: 'Rescue', fa: 'امداد' } },
    { slug: 'fire', title: { en: 'Fire', fa: 'اطفا' } },
  ]),
}));
vi.mock('../features/leads/RequestItemNote', () => ({ RequestItemNote: () => null }));
afterEach(cleanup);

function show(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fields = [formFieldSchema.parse({ id: 'chosen-course', type: 'select', label: { fa: 'دوره', en: 'Course' }, optionsFrom: 'courses' })];
  render(<QueryClientProvider client={client}><PreferencesProvider locale="fa" onLocaleChange={() => {}}><MemoryRouter initialEntries={['/request'+search]}><CustomRequestForm requestType="training" fields={fields} preview /></MemoryRouter></PreferencesProvider></QueryClientProvider>);
  return client;
}
it('selects the linked table item after choices load and preserves a later manual selection', async () => {
  const client=show('?item=courses%2Frescue');
  const field=await screen.findByRole('combobox', { name: /دوره/ });
  expect(field).toHaveValue('امداد');
  fireEvent.change(field, { target: { value: 'اطفا' } });
  await client.invalidateQueries({queryKey:['public','firefighter','form-options']});
  await waitFor(()=>expect(field).toHaveValue('اطفا'));
  client.clear();
});
it('ignores unrelated item links and gives an explicit field parameter precedence', async () => {
  let client=show('?item=other%2Frescue');
  expect(await screen.findByRole('combobox', { name: /دوره/ })).toHaveValue('');
  cleanup(); client.clear();
  client=show('?item=courses%2Frescue&chosen-course=Fire');
  expect(await screen.findByRole('combobox', { name: /دوره/ })).toHaveValue('اطفا');
  client.clear();
});