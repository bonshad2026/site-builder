import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { AddToCartButton } from '../features/cart/AddToCart';
import { CartProvider, useCart } from '../features/cart/cart';
import type { ProductDto } from '../types/api';
vi.mock('../features/public-site/data', () => ({ useSiteSettings: () => ({ data: { modules: { orders: true }, shop: { maxPerProduct: 3, orderMode: 'checkout' } } }), useProducts: () => ({ data: [] }) }));
vi.mock('../lib/preferences', () => ({ usePreferences: () => ({ m: { shop: { addToCart: 'Add', added: '{count} in cart', viewCart: 'Cart' } }, l: (v: any) => v.en, formatNumber: String, format: (v: string, args: any) => v.replace('{count}',args.count) }) }));
afterEach(() => { cleanup(); localStorage.clear(); });
const product = { isAvailable: true, id: 'coffee', slug: 'coffee', name: { en: 'Coffee', fa: '' }, priceMinor: '100', currency: 'IRR', imageUrl: null, stock: null, maxPerOrder: null, colors: [] } as unknown as ProductDto;
function Clear(){ const cart=useCart();return <button onClick={cart.clear}>Clear</button>; }
it('shows actual cart quantity after repeated adds, respects cap and clears its status with the cart', () => {
 render(<MemoryRouter><CartProvider siteId="count-test"><AddToCartButton product={product} /><Clear /></CartProvider></MemoryRouter>);
 const add=screen.getByRole('button',{ name:'Add' });
 fireEvent.click(add);expect(screen.getByRole('status').textContent).toContain('1 in cart');
 fireEvent.click(add);expect(screen.getByRole('status').textContent).toContain('2 in cart');
 fireEvent.click(add);expect(screen.getByRole('status').textContent).toContain('3 in cart');
 expect((add as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Clear'}));
 expect(screen.queryByRole('status')).toBeNull();expect((add as HTMLButtonElement).disabled).toBe(false);
});
