import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './renderApp';

/** These run without an API (VITE_API_URL is empty in tests), on the bundled demo content. */
describe('public site', () => {
  it('renders the home page from its section document', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /rooms that feel inevitable/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /four ways to work with us/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /before you call/i })).toBeInTheDocument();
  });

  it('shows the 404 page for unknown pages and unknown product slugs', async () => {
    renderApp('/nowhere');
    expect(await screen.findByRole('heading', { name: /this room does not exist/i })).toBeInTheDocument();
  });

  it('shows 404 for an unknown product slug', async () => {
    renderApp('/products/missing-piece');
    expect(await screen.findByRole('heading', { name: /this room does not exist/i })).toBeInTheDocument();
  });

  it('serves Persian under /fa with RTL direction', async () => {
    renderApp('/fa');
    expect(await screen.findByRole('heading', { level: 1, name: /فضاهایی که درست/ })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(document.documentElement).toHaveAttribute('lang', 'fa');
  });

  it('switches language in place, keeping the current page', async () => {
    const app = renderApp('/products');
    await screen.findByRole('heading', { level: 1, name: /furniture and objects/i });
    await userEvent.click(screen.getAllByRole('button', { name: 'فا' })[0]);
    expect(await screen.findByRole('heading', { level: 1, name: /مبلمان و اشیا/ })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(app.router().state.location.pathname).toBe('/fa/products');
    expect(app.router().basename).toBe('/fa');
  });

  it('switches theme', async () => {
    renderApp('/');
    await userEvent.click((await screen.findAllByRole('radio', { name: 'Noir' }))[0]);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('noir'));
  });

  it('opens and closes FAQ items on the FAQ page, and searches them', async () => {
    renderApp('/faq');
    const button = await screen.findByRole('button', { name: /how does a project start/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/paid discovery visit/i)).toBeVisible();
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz');
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });

  it('filters and searches products, with an empty state', async () => {
    renderApp('/products');
    await userEvent.click(await screen.findByRole('button', { name: 'Lighting' }));
    expect(screen.getByText('2 results')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'zzz');
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByText('8 results')).toBeInTheDocument();
  });

  it('filters the portfolio gallery by category', async () => {
    renderApp('/projects');
    await userEvent.click(await screen.findByRole('button', { name: 'Hospitality' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('opens the mobile menu (built from the site menu) and closes it with Escape', async () => {
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Services' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('contact form (no API configured)', () => {
  it('shows validation errors for an empty submission', async () => {
    renderApp('/contact');
    await userEvent.click(await screen.findByRole('button', { name: /send enquiry/i }));
    expect(await screen.findByText(/please enter your name/i)).toBeInTheDocument();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a project type/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm we may contact you/i)).toBeInTheDocument();
  });

  it('rejects an invalid phone and accepts Persian digits', async () => {
    renderApp('/contact');
    const phone = await screen.findByLabelText(/mobile number/i);
    await userEvent.type(phone, 'abc');
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }));
    expect(await screen.findByText(/valid mobile number/i)).toBeInTheDocument();
    await userEvent.clear(phone);
    await userEvent.type(phone, '۰۹۱۲۳۴۵۶۷۸۹');
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }));
    await waitFor(() => expect(screen.queryByText(/valid mobile number/i)).not.toBeInTheDocument());
  });

  it('pre-fills from a service link and clearly labels the result as a demo', async () => {
    renderApp('/contact?service=design-consultation');
    await waitFor(() => expect(screen.getByLabelText(/project type/i)).toHaveValue('consultation'));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Sara Ahmadi');
    await userEvent.type(screen.getByLabelText(/^email/i), 'sara@example.com');
    await userEvent.type(screen.getByLabelText(/tell us about your space/i), 'A two-bedroom apartment in need of a calmer living room.');
    await userEvent.click(screen.getByLabelText(/agree to be contacted/i));
    await userEvent.click(screen.getByRole('button', { name: /send enquiry/i }));
    expect(await screen.findByText(/was NOT sent or stored/i, {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
