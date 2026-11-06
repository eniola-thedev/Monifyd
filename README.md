# Monifyd

Non-custodial crypto payment gateway: payment links, invoices, hosted checkout, REST API.
Monifyd currently adds no transaction fee to customer payments. Customers pay the amount requested by the merchant.

## Set up

1. Create a Supabase project and run every migration in `supabase/migrations/` in numeric order, currently through `0022_repair_payment_transition_rpc.sql`. Before deploying this version or applying `0015_bachs_only.sql`, cancel any active subscriptions created with the previous provider in its dashboard.
2. **Google sign-in:** in Google Cloud Console create an OAuth client (Web). Add the redirect URI shown in
   Supabase under Authentication > Providers > Google, then paste the client ID and secret there and enable it.
   In Supabase Authentication > URL Configuration, set the Site URL to `https://monifyd.com` in production and add
   `<your app URL>/auth/callback` to the redirect URLs.
   In Supabase Authentication > Providers > Email, enable email confirmations to require verification for new email/password accounts. Set up SMTP so confirmation messages are delivered reliably.
3. `cp .env.example .env.local` and fill it in. Set `WEBHOOK_SIGNING_SECRET_PEPPER` to a randomly generated value of at least 32 bytes (for example, `openssl rand -base64 32`). Keep it in your deployment secret manager and do not rotate it without re-encrypting existing endpoint secrets. Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to `https://monifyd.com` in your production environment.
   Configure Paystack NGN plan codes and BACHS USD product IDs before enabling paid plans.
4. `npm install && npm run dev` (or deploy, for example to Vercel).
5. Set `CRON_SECRET` in the Vercel Production environment and deploy. `vercel.json` schedules
   `GET /api/cron/detect` every minute; Vercel Cron sends the required `Authorization: Bearer <CRON_SECRET>` header.
   Confirm your Vercel plan supports this frequency. If using an external scheduler instead, disable the Vercel cron
   or ensure only one scheduler is active, then configure it to send that same header.
   Payments also get checked every few seconds while the customer has the checkout page open. The scheduler also retries webhooks and sends invoice reminders.

Login allows 30 attempts per client IP per 15 minutes. Five incorrect-password attempts for an email address within 15 minutes trigger a 15-minute lockout; a successful login clears that account's failed-attempt counter. The login limiter requires the hosting proxy to provide a trusted client IP in `cf-connecting-ip`, `x-real-ip`, or `x-forwarded-for`; configure the proxy to overwrite or sanitize these headers rather than passing through client-supplied values.

After configuring the pepper and applying migration `0008_security_hardening.sql`, run `npm run security:encrypt-webhook-secrets` once to encrypt existing webhook endpoint secrets. New endpoints are encrypted automatically.

## Account deletion

Signed-in users can schedule permanent account deletion from Dashboard, Settings. Deletion takes effect after seven days. Dashboard, API-key, and payment-checkout access are disabled during the grace period; the user can cancel from the account-deletion page. A workspace owner must stop paid-plan renewal before scheduling deletion. When an owner is permanently deleted, Monifyd deletes the associated workspace payment, invoice, and account data; team-member deletion removes that user's access and account. The existing once-per-minute `/api/cron/detect` scheduler claims and processes due deletions. Apply migration `0009_account_deletion.sql` before enabling this flow.

## How payments are detected

Each open payment gets a unique amount (a few base units of extra "dust", well under one cent for stablecoins).
The detector watches the merchant's wallet, matches an incoming transfer to the payment with exactly that amount,
tracks confirmations, and marks the payment PAID at the network's required depth. Only exact matches are
attributed automatically. A transfer with a different amount stays unmatched and the quote expires.
Customers can leave checkout without cancelling the quote and return later through the same invoice link;
pending payment and invoice statuses refresh automatically in the dashboard.

Supported assets: BTC on Bitcoin; native ETH, USDC and USDT on Ethereum; USDC on Base and Polygon; USDT on BNB Chain; and SOL, USDC and USDT on Solana. Native ETH detection scans Ethereum blocks for direct transfers to checkout addresses. Public RPC endpoints are rate-limited: use dedicated ones for real traffic.

## Before you take real money

Test the full flow yourself with a few dollars on each chain, and verify the token contract addresses in the
last lines of the migration against the issuers' official pages.

## Webhooks

Merchants add endpoints in Dashboard, Webhooks. Events are signed (HMAC-SHA256 over `timestamp.body`), sent immediately,
and retried by the same scheduler as payment detection (1m, 5m, 30m, 2h, 6h, 24h, then failed). Endpoints must be public https
addresses; private and internal addresses are refused at save time and again at send time. Run `0002_webhooks.sql` too.

## Wrong-amount payments

Run `0003_wrong_amounts.sql` (it also stores crypto amounts as exact text). A confirmed payment ends as PAID, UNDERPAID or OVERPAID.
The merchant can accept an underpayment or close it. Overpayments count as paid in full. Transfers that match no payment are listed
under Payments to assign or ignore, including late payments on an expired quote (watched for 24 hours). Merchants can opt in
to automatic matching in Settings, which only applies when exactly one payment is open on the wallet.

During an open quote, confirmed transfers on the same network and asset accumulate toward its total. If exactly one payment is open on that wallet, smaller transfers are attributed to it; ambiguous transfers remain unmatched for manual assignment. This makes a dedicated receiving wallet important: unrelated deposits can be mistaken for a split payment while a single quote is open. A payment settles once the aggregate reaches the quote amount and the relevant transactions have enough confirmations. A partial payment becomes UNDERPAID only after the quote expires and all transfers detected for it have enough confirmations. Additional transfers emit `payment.partial` webhooks and merchant notifications.

## Refund tracking

After a payment is confirmed, merchants can record one or more partial refunds from the payment details page. Each record includes the refund amount, original asset and network, destination, customer email (optional for payment-link payments), transaction hash, and manually updated status. The total of recorded refunds cannot exceed the amount received; failed refund attempts release the reserved amount. Refund transfers are always initiated by the merchant from their own wallet. Monifyd does not custody, send, or independently verify refunded funds.

If a customer email is provided, the scheduler sends updates when a refund is marked sent, confirmed, or failed. Failed emails are retried and surfaced to the merchant and admin operations queue. Delivery is at-least-once, so customers may occasionally receive a duplicate email if the delivery state cannot be saved.

## Dashboard and API plans

Dashboard and API plans are separate NGN subscriptions. Dashboard plans cover reporting and team features. API plans cover API request limits and webhook endpoint limits. Customers can subscribe to either or both.

| Dashboard plan | Pricing | Benefits |
| --- | --- | --- |
| Free | 0 | Core payments, basic monthly reports, CSV exports, one owner |
| Pro | $9/month or $90/year internationally; ₦3,500/month or ₦33,500/year in Nigeria | Free features, unpaid-invoice reminders, branded checkout, customer directory, advanced reports, insights, and templates |
| Business | $29/month or $290/year internationally; ₦13,000/month or ₦133,500/year in Nigeria | Pro features, five seats and roles, shared workspace, audit trail, multiple projects, project permissions, and priority support |

| API plan | Pricing | Benefits |
| --- | --- | --- |
| Free | 0 | 120 reads/30 writes per minute; 2 webhook endpoints |
| Growth | $19/month or $190/year internationally; ₦10,000/month or ₦100,000/year in Nigeria | 600 reads/150 writes per minute; 10 endpoints; signed webhooks, retries, idempotency, and replay |
| Scale | $79/month or $790/year internationally; ₦40,000/month or ₦400,000/year in Nigeria | 2,400 reads/600 writes per minute; 25 endpoints; longer logs, scoped keys, monitoring, and priority support |

NGN recurring subscriptions for Dashboard and API plans use Paystack; USD recurring subscriptions use BACHS. Configure `PAYSTACK_SECRET_KEY` and the eight `PAYSTACK_PLAN_*_NGN_*` plan codes in `.env.example`, creating monthly and annual plans at the listed NGN prices. Set Paystack webhook URL to `https://<your-domain>/api/webhooks/paystack` and subscribe to `charge.success`, `subscription.create`, `invoice.payment_failed`, and `subscription.disable`. Configure `BACHS_ENVIRONMENT=production`, `BACHS_API_KEY`, `BACHS_WEBHOOK_SECRET`, and the `BACHS_PRODUCT_*_USD_*` IDs. Create recurring BACHS products for each USD plan and interval at the matching prices. USD annual prices are 10 times the monthly price (two months free): Dashboard Pro $90/year, Dashboard Business $290/year, API Growth $190/year, and API Scale $790/year. Configure `https://<your-domain>/api/webhooks/bachs` in BACHS for `checkout.completed`, `collection.succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Checkout detects country from Vercel or Cloudflare geo headers: Nigeria uses NGN with Paystack and other detected countries use USD with BACHS; both support monthly and annual billing. Unknown country defaults to Nigeria. Existing subscriptions created before this migration cannot be canceled from Monifyd; cancel them with their original provider before they renew, then start a new checkout with the provider assigned to the subscription currency. Stored payment methods are not migrated. Only workspace owners can start or cancel subscriptions. Existing paid Dashboard subscribers retain their bundled API entitlements while their existing subscription remains active; new Dashboard plans do not include paid API quotas.
## Invoice API and reminders

API keys can create invoices with `POST /api/v1/invoices`, list them with `GET /api/v1/invoices`, retrieve one with `GET /api/v1/invoices/:id`, email one with `POST /api/v1/invoices/:id/send`, and cancel one with `POST /api/v1/invoices/:id/cancel`. Use an `Idempotency-Key` on invoice creation. The email provider must be configured with `RESEND_API_KEY` and `EMAIL_FROM`.

The scheduler sends reminders three days before an invoice due date and again on the due date. It retries failed deliveries up to three attempts. Reminders are tracked in `invoice_reminders` to prevent duplicate sends; a reminder that cannot be delivered creates a merchant notification and admin operational alert.

## Admin dashboard

The migration adds a `role` field to profiles; all users default to `merchant`. A trusted operator can grant access directly in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<auth user UUID>';
```

Admin users can visit Dashboard, Admin to review merchants, payments, platform fees, and recent audit activity, and suspend or reinstate merchant accounts. Profile role changes are protected against authenticated self-promotion.

## CSV export and JavaScript SDK

Merchants can search and paginate payment/invoice lists, download payment and invoice CSV exports, review notifications, and see fee/revenue reports. Pro and Business can filter detailed fee reports by date. API list endpoints accept `limit` and `offset`; payment listing also accepts a `status` filter. API keys have API-plan-based read/write limits, separate from Dashboard plan features.

The standalone package in `sdk/` is ready to publish as `@monifyd/sdk`; see [sdk/README.md](./sdk/README.md) for installation, usage, and available methods.

## Production readiness

- Use HTTPS, a unique long `CRON_SECRET`, and a scheduler that calls `/api/cron/detect` every minute. Monitor non-2xx cron responses and `GET /api/health`.
- Configure dedicated, authenticated RPC providers for every supported network. Do not put provider credentials in client code or logs. Monitor rate limits, scan errors, and confirmation delays in Dashboard, Admin.
- Before enabling any asset/network pair, verify the token address or mint and decimals against the issuer's official documentation. Send and confirm a small test payment on each enabled network.
- Test partial transfers, transfers arriving near quote expiry, underpayments, overpayments, reorgs, delayed confirmations, duplicate cron runs, and RPC outages before handling production value. Set operational runbooks for pausing affected networks and contacting merchants; refunds remain a manual merchant decision.
- Back up Supabase regularly and test restoring a backup into a separate project. Keep the service-role key and email/RPC credentials in the deployment provider's secret manager; rotate them after any suspected exposure.
- Configure Resend and verify the sender domain before relying on invoice or reminder email. Reminder and webhook delivery is at-least-once; consumers should safely handle duplicate events.
- Configure and verify BACHS production credentials and recurring products before turning on subscription checkout. Set `BACHS_ENVIRONMENT=sandbox` only when deliberately using a sandbox account.
- Apply and test all migrations through `0019_chain_detection_health.sql` in a non-production Supabase project before deploying. Test Dashboard/API checkout, renewal, cancellation, native ETH detection, legacy API access, team invitations, role enforcement, expired Business access, concurrent invitation attempts, account deletion and cancellation at the seven-day boundary, webhook secret access, payment settlement failures, invoice design storage access, and invoice numbering.
- Grant the admin role only to named trusted operator accounts. Periodically review access and the operational-event queue.

## Checks

Run app tests with `npm run test:fees`, `npm run test:amounts`, `npm run test:webhooks`, `npm run test:reminders`, `npm run test:rpc`, `npm run test:api`, `npm run test:refund-email`, `npm run test:refund-amount`, and `npm run test:billing-plans`. Run SDK tests with `npm test` from `sdk/`.

Idempotency responses are retained for 30 days. Consumers should retry a pending request with the same key and body; reusing the key with a different body returns a conflict.

## Not built yet

Automated refunds, a test-mode payment environment, and network-specific circuit breakers are not built yet.

## Security rules

Never store private keys, seed phrases or wallet passwords. API keys are stored as SHA-256 hashes. The service-role key stays server-side.
