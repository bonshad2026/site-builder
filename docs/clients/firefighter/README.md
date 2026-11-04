# FireFighter — client site

A Persian (RTL) site for a fire-safety training centre: specialised courses with trainers sent to
the client's organisation, trainer profiles and reviews, training requests, guides, news, NFPA,
free training, FAQ and terms. Studio slug `firefighter`, preview http://firefighter.preview.localhost.

## How it is built
Everything is made through the studio API by one script; nothing is hand-edited in the admin.

```bash
node tools/firefighter-site/build.mjs     # studio up; deletes and rebuilds the `firefighter` site
```

- `tools/firefighter-site/content-courses.mjs` — 13 courses (one per "specialised training" submenu),
  levels, categories and the 6 sample trainers.
- `tools/firefighter-site/content-pages.mjs` — guides, news, NFPA documents, free training, FAQ, terms, about.
- `tools/firefighter-site/build.mjs` — tables, items, photos, settings (menus, footer, themes, accounts,
  request forms and workflow), 40 pages, then sample customers, requests and reviews through the
  public API, and marks sample rows `demo = true`.
- Photos: `var/firefighter-photos/` (not in Git) with `credits.json`. `SKIP` in `build.mjs` lists photos
  left out (the owner rejected `rescue-carry`). The gallery repeats the scene photos to show 20 items.

## What the site has
- Menu as in the brief (Equipment, Guides, Training, Specialised training and trainers with 13
  submenus, News, Trainers, About, Contact), sign-in button and a "training request" button.
- Two looks the visitor picks in the header: light (`firefighter`) and dark (`firefighter-dark`),
  set by `design.visitorThemes`.
- Footer: Telegram, Instagram, Eitaa, Bale; FAQ (16 questions), terms, image credits, quick links.
- Courses: code, level, trainers (links to their pages), certificate yes/no, summary, syllabus,
  audience, prerequisites, standard reference; a "request this course" button.
- Accounts by phone with three kinds: organisation, person, trainer. A trainer fills their own
  profile (photo, bio, files with titles, courses, regions, availability); staff approve it.
- Training request form with every field in the brief (course list read from the courses table,
  Jalali date, province list, lodging yes/no, …), stages new → reviewing → scheduled → held /
  cancelled; the customer sees their requests and stages in "My account".
- Reviews: after a request assigned to a trainer is "held", that customer can rate the trainer.

## Sample data (replace with the client's real data)
Install packages built "with sample data" keep these; without it they are removed.
- **Trainers (all 6 are sample):** آرش کیانی، کامران صدری، نسترن فرهمند، بهروز ملکی، سارا توانا، رضا شایان —
  invented names; photos are crops of the Commons photos; CVs and certificates are placeholder PDFs.
- **A trainer waiting for approval:** مهدی پویا (phone 09121000009).
- **Sample customers:** 09121000001–09121000003 (sample organisations), password `firefighter-demo`.
- **6 training requests and 4 reviews** made by those customers.
- **News marked «نمونه»:** the 3 Iran news items (`sample-iran-*`), field "خبر نمونه" ticked.
- **Guide marked as sample:** «نمونه بخشنامه: برگزاری مانور تخلیه در ساختمان‌های اداری».
- **Placeholders in settings:** email `info@example.com`, phone `۰۲۱-۰۰۰۰۰۰۰۰`, address, social links
  (`t.me/example`, `instagram.com/example`, `eitaa.com/example`, `ble.ir/example`), about-us story.

## Sources
- Guides: Iranian National Building Regulations, Part 3 (fire protection of buildings); NFPA 10,
  25, 72, 470, 1006 (each guide names its source on its page).
- NFPA documents on the NFPA page (numbers and titles checked on nfpa.org): 1, 10, 13, 14, 20, 25,
  72, 101, 403, 470, 1006, 1010, 1020, 1081, 1550, 1600, 1970, 2400.
- Real news (with links on each item): NVFC (NIOSH hoarding fire report), UL Solutions (NFPA 1970),
  Security Sales & Integration (NFPA Fire Marshal of the Year 2026).
- Photos: Wikimedia Commons, public domain or CC BY 2.0; the full list with authors and links is on
  the site's "منابع تصاویر" page (`/image-credits`) and in `var/firefighter-photos/credits.json`.

## Install
Build the package at http://admin.localhost/deploy/ ("بسته‌ی نصب کامل", tick "همراه داده‌ی نمونه" so
the trainers and sample news stay). It lands in `exports/`; installing on the client's server is in
`deploy/export/README.md` (inside the package): run `install.sh` (Linux) or `install.ps1` / `install.cmd`
(Windows), which prints the address and ports. Accounts in a new package: operator `admin`, client
`owner` (passwords from `SITE_OPERATOR_*` / `SITE_OWNER_*`; change them on first sign-in).
