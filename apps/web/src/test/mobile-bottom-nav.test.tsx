import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { MobileBottomNav } from '../components/layout/MobileBottomNav';
const state = vi.hoisted(() => ({ header: { mobileLinks: [] as any[], showCart: true, showAccount: true } }));
vi.mock('../features/public-site/data', () => ({ useSiteSettings: () => ({ data: { header: state.header, modules: { products: true, orders: true } } }) }));
vi.mock('../features/account/customerApi', () => ({ useCustomer: () => ({ enabled: true }) }));
vi.mock('../features/cart/cart', () => ({ useCart: () => ({ count: 3 }) }));
vi.mock('../lib/preferences', () => ({ usePreferences: () => ({ locale: 'fa', l: (v: any) => v.fa, formatNumber: String }) }));
afterEach(() => { cleanup(); state.header.mobileLinks = []; });
it('shows active destination, cart quantity and an operable full-menu action', () => {
 const more = vi.fn();
 render(<MemoryRouter initialEntries={['/cart']}><MobileBottomNav onMore={more} /></MemoryRouter>);
 expect(screen.getByRole('link', { name: /سبد خرید/ }).getAttribute('aria-current')).toBe('page');
 expect(screen.getByText('3')).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'بیشتر' }));
 expect(more).toHaveBeenCalledOnce();
});
it('uses configured labels and destinations instead of automatic links', () => {
 state.header.mobileLinks = [{ href: '/menu', label: { fa: 'منوی کافه', en: 'Cafe menu' }, icon: 'coffee' }];
 render(<MemoryRouter><MobileBottomNav onMore={() => {}} /></MemoryRouter>);
 expect(screen.getByRole('link', { name: 'منوی کافه' }).getAttribute('href')).toBe('/menu');
 expect(screen.queryByRole('link', { name: 'محصولات' })).toBeNull();
});
