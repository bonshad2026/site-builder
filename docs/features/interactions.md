# Request forms, workflows, customer accounts and tracking

## Forms (request types)
Each request type (in `settings.requestTypes`) is a fully editable form (`formVersion` 2): every
question is a field, including name / phone / email (`role` marks the follow-up ones) and consent.
14 field types (shared `siteOptions.ts` `FORM_FIELD_TYPES`) incl. date, time, file upload (private,
`request_files`, `POST /public/sites/:s/uploads`), heading and `step` (multi-page); limits
(`min`/`max`), ready checks (`pattern`: national id, postal code, IBAN…), placeholders, conditions,
width. Prices on choices, tick boxes and numbers (price × number) add up to `payment.amountMinor`
(`computeTotal`, recomputed on the server). `layout`: columns, button and thank-you texts, step progress.
Links can prefill questions (`?<key>=value`). New sites store their default types as version 2 already
(`defaultRequestTypes` in shared `schemas.ts`). Version-1 types (only in older client packages) are
still converted on read (shared `forms.ts`), taking project-type and budget choices from
`settings.formOptions`, which has no editor any more: choices are edited on each field.
Old-style posts (name / email / message) still fill the converted questions.
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

## Account addresses and optional unverified signup
accounts.signupVerification defaults true. False requires a signup password and leaves verified_at
NULL; signup/password login cannot claim old guest cases by matching an unverified identifier.
Profile addresses (up to ten named entries) are tenant-local and visible to authorized customer staff.
Instagram checkout rechecks the selected address and session identity server-side.
See instagram-orders.md.

## SMS opt-out footer
All Console and Kavenegar plain-text SMS adapters use withSmsFooter to normalize trailing legacy
cancellation lines and append exactly one newline plus `لغو ۱۱`. This applies centrally to OTP
console text, workflow/order notifications and panel test SMS; editable message templates are not
rewritten. Stored verification codes remain unchanged. See auth/notifications.ts and sms-footer.test.ts.

Kavenegar OTP uses the operator-configured remote verify/lookup template. A numeric OTP token
cannot carry whitespace/newlines: put the footer in the provider's template itself, retaining its
verification placeholder and delivery policy. Enabling SMS or selecting a template does not update
that remote template. Configure and verify it separately for each provider account. The maintenance
helper stops if provider fallback policy cannot be safely preserved. No generic guarantee of a live
OTP footer can be made from local unit tests. Per-client completion belongs in operational records.

## Account/profile configuration and ownership
AccountsTab exposes signupVerification. Default true uses the existing code-verification flow;
false requires a password and does not verify identifier ownership. Customer profile addresses
use existing customer APIs and permissions; they do not add a separate business/customer database.
Staff visibility remains tenant-scoped. See instagram-orders.md for identity/address checks during
submission. Changing this option is a per-site decision, not a product-wide disabling of OTP.

## Public account page spacing
Account, tracking and case pages reserve the same fixed-header clearance as inner page headings
(9rem base, 11rem from sm). This keeps authentication tabs below two-row desktop headers.
The existing mobile bottom-navigation override still uses 1.5rem beneath its in-flow header.

## Customer session refresh
The customer session query rechecks on mount and window focus even while its cached result is
fresh. This allows a request tab with a cached signed-out result to recognize login in another
tab (and recognize logout). Signed-in-only forms wait for session loading/revalidation before
showing the login invitation. Regression: customer-session.test.tsx covers cached anonymous
state after login and a session ending while a tab is in the background. Server authorization
and tenant-local cookies remain authoritative; this does not share sessions across origins.

Contact-form sections omit their heading band when the current locale has no heading, eyebrow,
intro or labelled link button. A separate page-header can then sit directly above the form
without a second empty fixed-header spacer.
