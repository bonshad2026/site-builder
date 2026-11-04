import { normalizedProps, withSettingDefaults } from '@site-builder/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PreferencesProvider } from '../lib/preferences';
import { applyTexts } from '../lib/siteLook';
import { en } from '../locales/en';
import { SectionRenderer } from '../sections/SectionRenderer';

describe('site options', () => {
  it('gives settings saved before the options existed the defaults that keep their look', () => {
    const old = withSettingDefaults({ themeId: 'ivory' } as Record<string, unknown>);
    expect(old.header).toMatchObject({ brand: 'auto', showMenu: true, showCart: true, transparentOverHero: true, buttons: [] });
    expect(old.footer).toMatchObject({ showLogo: false, showBrand: true, columns: [] });
    expect(old.shopPage).toMatchObject({ columns: 4, sortOptions: ['featured', 'price-asc', 'price-desc'] });
    expect(old.shop).toMatchObject({ currency: 'IRR', maxPerProduct: 50, maxItemsPerOrder: null });
    expect(old.design.fonts).toEqual({ enDisplay: 'Cormorant Garamond', enBody: 'Inter', faDisplay: 'Vazirmatn', faBody: 'Vazirmatn' });
    expect(old.systemPages.services.layout).toBe('rows');
  });

  it("uses a site's own wording for built-in texts, only where it has some", () => {
    const m = applyTexts(en, { 'common.viewAll': { en: 'See everything', fa: '' }, 'shop.addToCart': { en: '', fa: 'بخر' } }, 'en');
    expect(m.common.viewAll).toBe('See everything');
    expect(m.shop.addToCart).toBe(en.shop.addToCart);
    expect(en.common.viewAll).not.toBe('See everything');
  });

  it('adds nothing around a section until its appearance is changed', () => {
    const wrap = (props: Record<string, unknown>) =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <PreferencesProvider locale="en" onLocaleChange={() => {}}>
            <MemoryRouter>
              <SectionRenderer section={{ id: 'r', type: 'rich-text', props: { body: { en: 'Hello', fa: '' }, ...props } }} />
            </MemoryRouter>
          </PreferencesProvider>
        </QueryClientProvider>,
      ).container;
    expect(wrap({}).firstElementChild?.tagName).toBe('SECTION');
    const changed = wrap({ appearance: { paddingTop: 'none', background: '#112233' } }).firstElementChild as HTMLElement;
    expect(changed.dataset.pt).toBe('none');
    expect(changed.style.getPropertyValue('--bg')).toBe('#112233');
  });

  it('keeps older single buttons when a section is opened in the editor', () => {
    const props = normalizedProps('cta', { cta: { label: { en: 'Go', fa: '' }, href: '/contact' } });
    expect(props.buttons).toEqual([{ label: { en: 'Go', fa: '' }, href: '/contact', style: 'primary', newTab: false, action: 'link', product: '' }]);
    expect(props.appearance).toMatchObject({ paddingTop: 'default', showOn: 'all' });
  });
});
