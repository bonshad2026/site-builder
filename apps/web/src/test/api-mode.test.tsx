import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackPages, fallbackProducts, fallbackSettings } from '../content/fallback';

/**
 * With VITE_API_URL set the site talks to the API. A fake fetch stands in for
 * the server and records what the site sends.
 */
type Handler = (url: URL, init: RequestInit) => { status?: number; body: unknown } | undefined;

function fakeApi(handler: Handler) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const custom = handler(url, init);
    if (custom) return new Response(JSON.stringify(custom.body), { status: custom.status ?? 200 });
    const path = url.pathname.replace('/api/v1/public/sites/atelier-navar', '');
    if (path === '/settings') return Response.json({ data: fallbackSettings });
    if (path === '/products') return Response.json({ data: fallbackProducts });
    if (path === '/services') return Response.json({ data: [] });
    if (path === '/payment-methods') return Response.json({ data: { online: true, provider: 'sandbox', isTest: true } });
    const page = path.match(/^\/pages\/(.+)$/);
    if (page) {
      const found = fallbackPages.find((p) => p.slug === page[1]);
      return found ? Response.json({ data: found }) : Response.json({ error: { code: 'not_found', message: 'Page not found' } }, { status: 404 });
    }
    return Response.json({ error: { code: 'not_found', message: 'nope' } }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

async function loadApp() {
  vi.resetModules();
  return (await import('./renderApp')).renderApp;
}

beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://api.test'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('contact form with the API', () => {
  it('posts the lead to the site’s public endpoint and confirms real receipt', async () => {
    const calls = fakeApi((url, init) => (init.method === 'POST' && url.pathname.endsWith('/leads') ? { status: 201, body: { data: { received: true } } } : undefined));
    (await loadApp())('/contact?service=design-consultation');

    await userEvent.type(await screen.findByLabelText(/full name/i), 'Sara Ahmadi');
    await userEvent.type(screen.getByLabelText(/^email/i), 'sara@example.com');
    await userEvent.type(screen.getByLabelText(/tell us about your space/i), 'A two-bedroom apartment in need of a calmer living room.');
    await userEvent.click(screen.getByLabelText(/agree to be contacted/i));
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }));

    expect(await screen.findByText(/we received your enquiry/i)).toBeInTheDocument();
    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(post.url.pathname).toBe('/api/v1/public/sites/atelier-navar/leads');
    expect(JSON.parse(String(post.init.body))).toMatchObject({ type: 'consultation', consent: true, email: 'sara@example.com' });
  });

  it('shows an error and does not claim success when the API rejects the lead', async () => {
    fakeApi((_url, init) => (init.method === 'POST' ? { status: 500, body: {} } : undefined));
    (await loadApp())('/contact');
    await userEvent.type(await screen.findByLabelText(/full name/i), 'Sara Ahmadi');
    await userEvent.type(screen.getByLabelText(/^email/i), 'sara@example.com');
    await userEvent.selectOptions(screen.getByLabelText(/project type/i), 'residential');
    await userEvent.type(screen.getByLabelText(/tell us about your space/i), 'A two-bedroom apartment in need of a calmer living room.');
    await userEvent.click(screen.getByLabelText(/agree to be contacted/i));
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }));
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/we received your enquiry/i)).not.toBeInTheDocument();
  });
});

describe('cart and checkout', () => {
  it('adds to cart, places the order with ids and quantities only, and redirects to the payment gateway', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, origin: 'http://localhost', pathname: '/', search: '' });
    const calls = fakeApi((url, init) => {
      if (init.method === 'POST' && url.pathname.endsWith('/orders')) return { status: 201, body: { data: { number: '1001', orderToken: 'tok-123456789' } } };
      if (init.method === 'POST' && url.pathname.endsWith('/orders/1001/pay')) return { body: { data: { redirectUrl: 'http://api.test/api/v1/payments/sandbox/x/SBX-1', isTest: true } } };
      if (url.pathname.endsWith('/products/sahel-lounge-chair')) return { body: { data: fallbackProducts[0] } };
      return undefined;
    });
    (await loadApp())('/products/sahel-lounge-chair');

    await userEvent.selectOptions(await screen.findByLabelText(/quantity/i), '2');
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    await userEvent.click(screen.getByRole('link', { name: /view cart/i }));
    expect(await screen.findByRole('heading', { name: /your selection/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /checkout/i }));

    expect(await screen.findByText(/test payment gateway/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ali Rezaei');
    await userEvent.type(screen.getByLabelText(/^email/i), 'ali@example.com');
    await userEvent.type(screen.getByLabelText(/mobile number/i), '09120000000');
    await userEvent.click(screen.getByRole('button', { name: /place order and pay/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('http://api.test/api/v1/payments/sandbox/x/SBX-1'));
    const order = calls.find((c) => c.init.method === 'POST' && c.url.pathname.endsWith('/orders'))!;
    const body = JSON.parse(String(order.init.body));
    expect(body.items).toEqual([{ productId: fallbackProducts[0].id, quantity: 2 }]);
    expect(JSON.stringify(body)).not.toMatch(/price/i);
  });

  it('shows the verified payment result to the buyer', async () => {
    fakeApi((url) =>
      url.pathname.endsWith('/orders/1001')
        ? { body: { data: { number: '1001', status: 'confirmed', paymentStatus: 'test_paid', currency: 'IRR', totalMinor: '290000000', items: [] } } }
        : undefined,
    );
    (await loadApp())('/checkout/result?order=1001&token=tok-123456789');
    expect(await screen.findByText(/test payment approved\. no real money was charged/i)).toBeInTheDocument();
  });
});
