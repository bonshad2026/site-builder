# Report: all stages (2, 3, 7 payments, 8, admin panel)

Earlier reports: [stage 1](stage-1-report.md) · [backend, stages 4–7](backend-report.md).

## What was added in this round

### Stage 2: design system and section library
- 14 section types live in `packages/shared/src/sections.ts`: page header, hero, rich text,
  image & text, features, stats, services, products, gallery/portfolio, testimonials, FAQ,
  pricing, call to action, contact form.
- Each type has a **Zod schema with defaults**, used in three places:
  - the API validates every saved page (bad links and unknown types are rejected; unknown
    props are dropped);
  - the builder creates new sections from the defaults;
  - the renderer **skips** an invalid or unknown section instead of crashing the page.
    An error boundary isolates each section.
- Renderers live in `apps/web/src/sections/`. Rich text never interprets HTML: only
  paragraphs, `- ` lists and `**bold**`.
- Site settings now include the **menu**, the **theme** (ivory/noir/sage), an optional
  **brand accent colour**, languages, contact, social links, modules and SEO, all edited in
  the admin.

### Stage 3: drag-and-drop page builder (`/admin/sites/:site/pages/:id/builder`)
- **Section library:** click a section to add it after the selected one, or drag it into the
  list.
- **Section list:** reorder with dnd-kit (mouse, or keyboard: Space plus arrow keys), move
  up/down buttons, duplicate, hide, delete.
- **Live preview** runs in an iframe, so desktop, tablet and mobile widths behave like real
  devices, with an EN/FA preview switch. Clicking a section in the preview selects it.
- **Settings panel:** generated from field definitions per section type. It covers bilingual
  text, image picker with upload, links, lists that can be reordered, and so on.
- **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z). Rapid typing counts as one undo step.
- **Autosave** of the draft 1.5 s after the last change, with a visible save status and a
  warning before leaving with unsaved changes.
- **Publish** saves first and then publishes. Visitors never see drafts.
- **Page settings:** title, URL slug, SEO title and description, no-index.
- **Page list:** create, delete, set the home page, reorder by drag.

### Admin panel (`/admin`)
- **Sign-in:** email and password, or SMS code. Also forgot/reset password, email
  verification and phone verification.
- **Platform admin:** client sites (create with a dedicated database, suspend, activate,
  retry a failed run, change owner), users (create, disable) and the audit log.
- **Per site:** dashboard; pages and builder; services; products (image, price, stock,
  featured); enquiries (status and notes); orders (items, payments, confirm, fulfil or cancel
  with stock returned); files (upload with a progress bar, public or private, copy URL,
  delete, clean up unused files); team (owner manages staff permissions); settings; payment.
- The menu only shows what the user's permissions and the site's modules allow. The server
  enforces the same rules independently.
- The admin UI is fully bilingual (EN/FA, RTL).

### Stage 7: online payment
- **Cart** is kept in the browser. **Checkout** sends only product ids and quantities, and
  the server prices the order.
- **Zarinpal** adapter (REST v4): request → redirect → callback → **server-to-server
  verify**. An order becomes `paid` only after verification succeeds.
- The **Zarinpal sandbox host** and the built-in **test gateway** move no real money. Their
  payments are recorded as **`test_paid`**, never `paid`, and the buyer is told so on the
  page. The test gateway is refused in production.
- Callbacks are idempotent, and only one successful payment per order is allowed (database
  constraint). A forged `Status=OK` without approval is rejected. The buyer views their order
  with a secret order token.
- The owner chooses the gateway and merchant id in the admin. These settings live in a
  private table that never appears in the public settings.

### Stage 8: languages and SEO
- Persian lives under **`/fa/...`** and English is the default. Switching language keeps the
  current page. `lang` and `dir` are set on `<html>`.
- Per page: title, description, canonical URL, `hreflang` (en, fa, x-default), Open Graph,
  robots `noindex`, and JSON-LD (LocalBusiness on the home page, FAQPage, Product with
  offer).
- API: `/public/sites/:site/sitemap.xml` covers both languages with alternates, plus
  `robots.txt`. A custom domain is used as the canonical URL in production.
- **Build-time prerender** (`apps/web/scripts/prerender.mjs`) writes static HTML with the
  correct meta tags for every published page, service and product in both languages, plus
  the sitemap and robots.txt. This run produced 40 pages.

## Verification (actually run)
| Check | Result |
|---|---|
| `npm run typecheck` (shared, api, web) | passes |
| `npm test -w apps/api` against real PostgreSQL 16 | **66/66**: auth 16, isolation 13, provisioning and migrations 6, content, orders and files 18, payments, sections and SEO 13 |
| `npm test -w apps/web` | **29/29**: public site, language and RTL, theme, FAQ, filters, gallery, contact form (demo and API), cart → checkout → gateway redirect, payment result, builder state (add, move, duplicate, hide, delete, undo, redo, autosave revision), section safety, admin sign-in redirect, CSRF header |
| `npm run build` | passes, including prerendering 40 pages |
| Browser, end to end on the real stack | Home rendered from DB documents · product → cart → checkout → test gateway → approved → result showed "test payment, no real money" and the dashboard counted it separately from real revenue · admin sign-in · builder: edit heading → live preview → autosave → public site unchanged until **Publish** (v1 → v2) → undo → keyboard drag reorder → restored and published (v3) · Persian `/fa/products`: RTL with correct canonical |

## Not verified / limitations (honest list)
- **Mouse drag** in the builder: dnd-kit is wired the same way as the keyboard drag, which
  was verified in the browser. Synthetic mouse events from the test tooling did not drive
  dnd-kit, so a mouse drag was not checked automatically. **Please try it once by hand.**
  A bug that blocked both kinds of drag (a competing drop zone) was found and fixed.
- **Zarinpal live/sandbox, SMTP and Kavenegar** have not been called for real. Their HTTP
  calls are tested with mocks.
- **S3** has not been tested against a real service, because Docker Hub blocked MinIO here.
  Local disk storage is tested.
- Prerendering writes **metadata only**. The page body is still rendered in the browser.
  Full server-side rendering would need a Node renderer, which is a possible next step.
- Rate limits are in memory, per API instance.
- Domain-based site selection on the front end uses `VITE_SITE_ID` per deployment. The API
  offers `/public/resolve?domain=` for a multi-domain host.
- No payment refund flow through the gateway yet. Refunds are handled manually.
