import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PreferencesProvider } from '../lib/preferences';
import { SectionRenderer } from '../sections/SectionRenderer';

function wrap(ui: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PreferencesProvider locale="en" onLocaleChange={() => {}}>
        <MemoryRouter>{ui}</MemoryRouter>
      </PreferencesProvider>
    </QueryClientProvider>,
  );
}

describe('section renderer', () => {
  it('renders a valid section', () => {
    wrap(<SectionRenderer section={{ id: 'a', type: 'cta', props: { heading: { en: 'Talk to us', fa: '' }, cta: { label: { en: 'Go', fa: '' }, href: '/contact' } } }} />);
    expect(screen.getByRole('heading', { name: 'Talk to us' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go/i })).toHaveAttribute('href', '/contact');
  });

  it('ignores unknown or invalid sections for visitors, and flags them in the editor', () => {
    const { container } = wrap(
      <>
        <SectionRenderer section={{ id: 'x', type: 'marquee', props: {} }} />
        <SectionRenderer section={{ id: 'y', type: 'cta', props: { cta: { href: 'javascript:alert(1)', label: { en: 'x', fa: '' } } } }} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();

    wrap(<SectionRenderer section={{ id: 'x', type: 'marquee', props: {} }} editing />);
    expect(screen.getByRole('note')).toHaveTextContent(/unknown section type/i);
  });

  it('hides hidden sections from visitors', () => {
    const { container } = wrap(<SectionRenderer section={{ id: 'h', type: 'cta', hidden: true, props: { heading: { en: 'Hidden', fa: '' } } }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('never renders HTML from content', () => {
    wrap(<SectionRenderer section={{ id: 'r', type: 'rich-text', props: { body: { en: '<img src=x onerror=alert(1)> **bold**', fa: '' } } }} />);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });
});
