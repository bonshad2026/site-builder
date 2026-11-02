# Request forms, workflows, customer accounts and tracking

## Forms (request types)
Each request type (in `settings.requestTypes`) is a fully editable form (`formVersion` 2): every
question is a field, including name / phone / email (`role` marks the follow-up ones) and consent.
14 field types (shared `siteOptions.ts` `FORM_FIELD_TYPES`) incl. date, time, file upload (private,
`request_files`, `POST /public/sites/:s/uploads`), heading and `step` (multi-page); limits
(`min`/`max`), ready checks (`pattern`: national id, postal code, IBAN…), placeholders, conditions,
width. Prices on choices, tick boxes and numbers (price × number) add up to `payment.amountMinor`
(`computeTotal`, recomputed on the server). `layout`: columns, button and thank-you texts, step progress.
Links can prefill questions (`?<key>=value`). Version-1 types and the old fixed forms are converted on
read (shared `forms.ts`); old-style posts (name / email / message) still fill the converted questions.
Ready-made forms for new sites: `SETUP_FORMS` / `setupRequestType` (shared `setup.ts`).

## Workflow
Access (anyone / signed-in) and stages with kind open / done / cancelled, allowed next stages, shown to
the customer or internal, notifications by SMS / email with `{{…}}` texts, customer may cancel / reply,
"ask for payment", an "after payment" stage; 5 presets (`WORKFLOW_PRESETS`, shared `interactions.ts`).
Workflows and staff addresses are stripped from public settings.

## Requests and orders
Requests (`leads` table) get a tracking code `R<number>`, a timeline (`case_events`: stage changes,
messages both ways, internal notes, payment requests, payments) and payments of their own
(`payments.lead_id`). Orders get the same timeline, messages and per-stage notifications
(`shop.orderStatuses[].notify/message`). Staff inbox (`src/admin/pages/InboxPages.tsx`): filters, stage
buttons, payment requests, assignee, unread counts; Customers page.

## Customer accounts
Optional (`settings.accounts`): phone or email + one-time code, optional password; per-site cookies
`sb_c_<slug>` / `sb_cc_<slug>`, CSRF header `X-Customer-CSRF`. `/account` (sign in / sign up, then
requests, orders and profile as tabs, a side menu, cards or one part only — see the `system-page`
options in [site-setup.md](site-setup.md)), `/track` by code + phone / email, and
`/track/<code>?t=<signed token>` links in messages.

## Who may change what
Clients may rename request types and stages and edit message texts only. Design updates keep the
client's `notifications`.

## Code
Shared `interactions.ts`, `forms.ts`; API `src/modules/interactions/` (requests service, public routes,
access tokens, notify), `src/modules/customers/` (accounts, sessions, codes), `src/modules/leads/`
(staff inbox); web `src/admin/interactions/` (form and workflow designer, timeline, customers),
`src/features/account/` (sign-in, account, `/track`, request page), `src/features/leads/CustomRequestForm.tsx`.
Tenant migrations `007_interactions.sql`, `008_request_files.sql`.
