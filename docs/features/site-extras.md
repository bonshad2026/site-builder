# Site extras: sticky buttons, stars, gallery media, news, AI assistant

General features any site can switch on (added 2026-11-15 on `feature/general-site-features`,
first used for the FireFighter site).

## Sticky buttons
`settings.stickyActions` (`stickyActionsSchema` in `siteOptions.ts`): up to 3 link buttons that stay
on screen while visitors scroll — a bar at the bottom, or a column at the side on wide screens
(bottom bar on phones); every page or the home page; optionally only after scrolling past the first
screen. Rendered by `StickyActions` in `SiteExtras.tsx`; it sets `--sticky-h` so `SiteLayout` leaves
room at the end of the page and the assistant button sits above it. Edited in Settings → Extras
(clients may edit it too, like the announcement bar).

## Rating star style
`settings.design.stars`: size (normal / large / xlarge) and colour (empty = amber). `useSiteDesign`
sets `--star-scale` and `--star-color`; `Stars` (CardView) and product reviews read them. Edited in
Settings → Design.

## Gallery videos and photo viewer, testimonial stars and photos
- Gallery items have `videoUrl` (Aparat / YouTube / Vimeo link or a file): the card shows a play
  mark and opens a viewer that plays it. Items without a link open their photo full size.
- Testimonials have `rating` (0–5, 0 = none) and `photoUrl`, in both layouts.

## News from other websites (`news-feed` section)
Up to 4 sources, each an RSS / Atom feed or a news-list page. For a page, `linkPattern` keeps only
same-site links whose address contains it (Tehran fire department `https://125.tehran.ir` →
`ArticleId`; Mashhad `https://125.mashhad.ir` → `/fa/news/`; neither has RSS). Titles link to the
source; nothing else is copied.
- API: `GET /api/v1/public/sites/:site/news?section=<section id>` finds the section in the published
  pages and fetches only its sources (`modules/news/news.service.ts`), with a 30-minute in-memory
  cache, 10 s timeout, 2 MB limit, and no private / local hosts. A failing source keeps its last
  headlines. Sources are mixed in turns up to `count`.
- `feedUrl` and `linkPattern` are structure keys: only the operator changes them.
- Tests: `apps/api/test/news.test.ts` (RSS, Atom, page links).

## AI assistant (GapGPT)
`settings.assistant`: name, picture, greeting, knowledge (the operator's facts: services, prices,
steps, rules), up to 4 suggested questions, model (default `gpt-4o-mini`). Operator-only card in
Settings → Extras. The public settings leave out `knowledge` and `model`.
- API: `POST /api/v1/public/sites/:site/assistant` `{ locale, messages[≤12] }` → `{ answer }`
  (`modules/assistant/assistant.service.ts`). The system prompt holds the site name, tagline,
  contact, published page list and the knowledge, and tells it to stay on topic and not invent.
  Rate limit: 20 questions per visitor per 10 minutes in production.
- Server key: `GAPGPT_API_KEY` (studio: `deploy/.env`, passed by `deploy/docker-compose.yml`; client
  package: its `.env`, passed by `deploy/export/docker-compose.yml`). `GAPGPT_BASE_URL` defaults to
  `https://api.gapgpt.app/v1` (OpenAI-compatible `/chat/completions`). No key → 503, the visitor sees
  "can't answer right now".
- Web: `components/layout/Assistant.tsx` — a round button with the picture (start corner, above the
  sticky bar), a chat panel; the conversation stays in the tab.
- Tests: `apps/api/test/assistant.test.ts` (off by default, prompt contents, hidden settings, no key,
  bad input).
