# Stage 1 report: visual front-end demo

## Implemented (working for real)
- 11 routes: home, services, service detail, collection, product detail, studio (about),
  projects, clients (testimonials), FAQ, contact, and 404 (also used for unknown slugs).
- Home sections: hero, stats and press, services, featured projects, advantages, featured
  products, testimonial slider, FAQ preview, CTA, full footer.
- English (LTR) and Persian (RTL): `lang`/`dir` on `<html>`, Vazirmatn font, Persian digits,
  translation files kept separate from components.
- 3 themes (Ivory, Noir, Sage) driven by CSS tokens.
- Product filtering, search and sorting, kept in the URL so a view can be shared.
  Project filtering. FAQ search, category filter and accordion.
- Mobile menu: a dialog with a focus trap that closes on Escape, scroll lock while open.
- Contact form uses react-hook-form + zod. It validates inline, shows an error summary,
  normalizes Persian digits, shows loading and success states, and pre-fills from
  service and product links.
- Skip link, visible focus styles, `prefers-reduced-motion` support.
- Per-page title, description, Open Graph and canonical tags (client-side).

## Simulated (not real yet)
- **Contact form submission** (`features/leads/submitLead.ts`): it waits 0.9 s and sends
  or stores nothing. The success message says so. The real endpoint comes in stage 7.
- Images are hot-linked from Unsplash. Object storage comes in stage 6.
- Content comes from TypeScript files, not an API. That moves to the backend in stage 4.

## Verification
- `npm run typecheck`: passes
- `npm test`: 11/11 pass (routing, 404, language/RTL, theme, FAQ, product filters and
  empty state, mobile menu, form validation, Persian phone digits, demo submit)
- `npm run build`: passes (JS 494 kB / 154 kB gzipped)
- Checked by hand in the browser at desktop width and at 375 px (RTL), with no horizontal
  scroll.

## Known limitations
- SEO tags are set client-side only. Prerendering is planned for stage 8.
- The language is not part of the URL yet (no `/fa/...` routes).
- The 768, 1024 and 1440 px widths were not checked one by one.
- No code splitting yet, so everything ships as one bundle.

## Next: stage 2
Design system and themes: a section library with a typed config, defaults and validation,
plus a per-site config model ready for the page builder.
