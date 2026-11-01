export type SitePage = {
  title: string;
  intro: string;
  sections: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
};

export const sitePages: Record<string, SitePage> = {
  pricing: {
    title: "Simple pricing",
    intro: "Choose dashboard features or API capacity independently. Each paid product has its own subscription.",
    sections: [
      { heading: "Dashboard plans", paragraphs: ["Free: payment links, invoices, checkout, crypto payment tracking, basic payment history, monthly reports, CSV exports, one workspace owner, and basic payment notifications.", "Pro: $9/month or $90/year for international customers, with annual billing charged upfront. In Nigeria, Pro is ₦3,500 per month or ₦33,500 per year, billed upfront. Includes automated unpaid-invoice reminders, branded checkout pages, a customer directory and payment history, advanced reports, payment insights, and saved templates.", "Business: $29/month or $290/year for international customers, with annual billing charged upfront. In Nigeria, Business is ₦13,000 per month or ₦133,500 per year, billed upfront. Includes everything in Pro, up to five seats with roles, a shared workspace, team activity and audit trail, multiple projects or stores, project-level permissions, and priority support."] },
      { heading: "API plans", paragraphs: ["Free: 120 reads and 30 writes per minute, two webhook endpoints, payment links, invoices and payment status, a test environment, and basic webhook logs.", "Growth: $19/month or $190/year for international customers, with annual billing charged upfront. In Nigeria, Growth is ₦10,000 per month or ₦100,000 per year, billed upfront. Includes 600 reads and 150 writes per minute, ten endpoints, signed webhooks with retries, idempotency keys for supported writes, webhook replay, and improved delivery logs.", "Scale: $79/month or $790/year for international customers, with annual billing charged upfront. In Nigeria, Scale is ₦40,000 per month or ₦400,000 per year, billed upfront. Includes 2,400 reads and 600 writes per minute, 25 endpoints, longer event-log retention, multiple scoped API keys, improved monitoring, and priority technical support."] },
      { heading: "Separate subscriptions", paragraphs: ["Dashboard plans cover reporting and team seats. API plans cover API rate limits and webhook endpoint limits. You can subscribe to either product or both; each paid plan is billed and cancelled separately through BACHS."] },
      { heading: "Payment fees", paragraphs: ["Monifyd currently adds no transaction fee to customer payments. Customers pay the amount requested by the merchant. Subscription plans are billed through BACHS."] },
      { heading: "Choose a plan", paragraphs: ["Plan subscriptions are managed in the dashboard. See Fees & Refunds for how payment fees and merchant-issued refunds work."] },
    ],
  },
  "supported-networks": {
    title: "Supported networks",
    intro: "Merchants can accept supported assets on the networks below when they have added a receiving wallet for that network.",
    sections: [
      { heading: "Bitcoin", bullets: ["BTC on Bitcoin"] },
      { heading: "EVM networks", bullets: ["USDC and USDT on Ethereum", "USDC on Base", "USDC on Polygon", "USDT on BNB Chain"] },
      { heading: "Solana", bullets: ["USDC on Solana", "USDT on Solana", "SOL on Solana"] },
      { heading: "Confirmation and availability", paragraphs: ["A payment is marked paid after the transfer reaches the confirmation depth configured for its network. Network availability and confirmation times depend on the relevant blockchain and RPC provider.", "Native ETH payments are not currently enabled. Check API Status for the app's database health check."] },
    ],
  },
  developers: {
    title: "Build with Monifyd",
    intro: "Create payment links and invoices from your server, then receive signed webhooks as payment status changes.",
    sections: [
      { heading: "Get started", paragraphs: ["Create a secret API key from Dashboard Settings → Developer settings. Keep the key on your server and send it as a bearer token. Use Idempotency-Key on create requests so safe retries do not create duplicate records."] },
      { heading: "Explore the API", bullets: ["Create and list payment links", "Create, send, retrieve and cancel invoices", "List and retrieve payments", "Receive signed webhook events" ] },
      { heading: "Useful links", bullets: ["Read the API documentation and reference.", "Review webhook event names, signature verification, and retries.", "Manage API subscriptions separately from dashboard plans."] },
    ],
  },
  "api-reference": {
    title: "API reference",
    intro: "The REST API is rooted at /api/v1. Authenticate requests with a secret API key in the Authorization header.",
    sections: [
      { heading: "Authentication", paragraphs: ["Send Authorization: Bearer sk_live_… or a test key. Secret keys are shown once when created and must be kept server-side."] },
      { heading: "Endpoints", bullets: ["POST, GET /payment-links — create and list payment links", "GET /payments and GET /payments/:id — list and retrieve payments", "POST, GET /invoices — create and list invoices", "GET /invoices/:id — retrieve an invoice", "POST /invoices/:id/send — email an invoice", "POST /invoices/:id/cancel — cancel an invoice"] },
      { heading: "Requests and limits", paragraphs: ["Amounts are supplied in major currency units. Include Idempotency-Key on payment-link and invoice creation. List endpoints accept limit and offset; payment listing also accepts status. API rate limits depend on your API plan, which is separate from your Dashboard plan."] },
      { heading: "Full guide", paragraphs: ["See Documentation for request examples, errors, webhook verification, and payment lifecycle details."] },
    ],
  },
  webhooks: {
    title: "Webhooks",
    intro: "Monifyd sends signed event notifications to your HTTPS endpoint when payment and invoice activity changes.",
    sections: [
      { heading: "Events", bullets: ["payment.created, payment.detected, payment.confirming, payment.partial, payment.paid", "payment.underpaid, payment.overpaid, payment.expired, payment.failed", "invoice.created, invoice.sent, invoice.paid, invoice.underpaid, invoice.overpaid, invoice.cancelled"] },
      { heading: "Verify every delivery", paragraphs: ["Verify X-Monifyd-Signature using HMAC-SHA256 over the timestamp, a period, and the exact raw request body. Reject old timestamps and use the event ID to deduplicate deliveries. Fulfil an order only after a payment.paid or invoice.paid event."] },
      { heading: "Retries", paragraphs: ["Respond with a 2xx status within eight seconds. Failed deliveries are retried with increasing delays for up to 24 hours, then marked failed. Delivery is at-least-once, so duplicate events are possible."] },
    ],
  },
  status: {
    title: "API Status",
    intro: "Check whether the Monifyd application can currently reach its database.",
    sections: [{ heading: "What this checks", paragraphs: ["This live check calls the health endpoint and verifies a database query. It does not report historical uptime or independently test blockchain networks, email delivery, webhooks, or BACHS."] }],
  },
  about: {
    title: "About Monifyd",
    intro: "Monifyd provides tools for businesses to request and track cryptocurrency payments while receiving funds directly into their own wallets.",
    sections: [
      { heading: "How it works", paragraphs: ["Merchants add receiving addresses, create payment links or invoices, and share a hosted checkout. Monifyd watches supported networks for transfers and reports payment status after configured confirmations."] },
      { heading: "Non-custodial payments", paragraphs: ["Monifyd does not take custody of payment funds and does not ask merchants for wallet private keys or seed phrases. Merchants remain responsible for their wallets and for sending any refunds."] },
    ],
  },
  contact: {
    title: "Contact",
    intro: "For product, account, or integration questions, contact the Monifyd team.",
    sections: [
      { heading: "Get in touch", paragraphs: ["Email support@monifyd.com. For API questions, include the endpoint and request ID, but never send your secret API key, wallet seed phrase, or private key."] },
      { heading: "Payment support", paragraphs: ["Include the payment or invoice ID and the public transaction hash where relevant. Do not share wallet credentials."] },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "Updated November 1, 2026. This page describes information Monifyd handles to provide its payment, dashboard, API, and billing services.",
    sections: [
      { heading: "Information we handle", bullets: ["Account information such as email address, name, business profile, and authentication data.", "Merchant configuration, receiving wallet addresses, payment links, invoices, payment records, transaction hashes, and notification preferences.", "API key hashes and prefixes, webhook URLs and signing secrets, delivery logs, team membership, and audit records.", "Customer details merchants submit, such as invoice email addresses, invoice-reminder preferences, and optional refund update email addresses.", "Subscription and billing records processed through BACHS or Paystack."] },
      { heading: "How information is used", paragraphs: ["We use this information to authenticate users, operate workspaces, create payment requests, detect and report transfers, send requested emails and webhooks, enforce plan limits, prevent abuse, provide support, and maintain service security."] },
      { heading: "Blockchain and service providers", paragraphs: ["Public blockchain activity is visible on its network and may be associated with a receiving address. Monifyd uses Supabase for authentication and database services, Resend to send email, and BACHS or Paystack to process subscription billing. Configured blockchain RPC and pricing providers receive the requests needed to check transfers and quotes. These providers process information under their own privacy terms."] },
      { heading: "Wallet credentials", paragraphs: ["Monifyd does not request or store seed phrases, wallet passwords, or private keys. Receiving addresses and public transaction data are not secret credentials."] },
      { heading: "Retention and security", paragraphs: ["We retain account and transaction records for as long as needed to operate the service, meet operational requirements, resolve disputes, and protect the service. We use access controls and security measures, but no internet service can guarantee absolute security."] },
      { heading: "Your privacy rights and data deletion", paragraphs: ["Depending on the laws that apply, you may have rights to be informed, access or correct personal data, object to or restrict processing, request portability or erasure, and complain to a supervisory authority. Some rights are subject to legal exceptions. You can manage profile information in Dashboard → Settings or contact support@monifyd.com to make a privacy request. To delete your account, schedule deletion in Dashboard → Settings. Deletion starts after a seven-day grace period, during which you can cancel it from the account-deletion page. Owners must stop subscription renewal before scheduling deletion. When deletion completes, the account and associated workspace data are permanently deleted from the application. Invoice-reminder opt-outs are retained to avoid sending further reminders to that address."] },
      { heading: "Policy changes", paragraphs: ["We may update this policy as the service changes. The updated date at the top of this page shows when the current version was published."] },
    ],
  },
  "cookie-policy": {
    title: "Cookie Policy",
    intro: "Updated November 1, 2026. Monifyd uses essential cookies for account sessions and to remember when this notice is dismissed. No analytics or advertising cookies are used.",
    sections: [
      { heading: "Essential cookies", bullets: ["Supabase authentication cookies maintain sign-in sessions and support account security. Their names and lifetimes can vary with project configuration.", "The first-party monifyd_cookie_notice cookie remembers that you dismissed the cookie notice. It expires after 180 days and does not contain an account identifier."] },
      { heading: "Analytics and advertising", paragraphs: ["The current application dependencies and source do not include analytics, advertising, or session-recording SDKs. Monifyd does not use optional analytics or advertising cookies."] },
      { heading: "Third-party services", paragraphs: ["The app uses Supabase for authentication and database requests, Resend for email delivery, BACHS or Paystack for subscription billing, and configured RPC and pricing services for blockchain operations. These are service integrations, not analytics SDKs; they receive data needed for the feature being used. Public pages also request web fonts from Google Fonts, which can expose standard connection data such as your IP address to Google."] },
      { heading: "Managing cookies", paragraphs: ["You can block or clear cookies in your browser settings. Blocking essential cookies may prevent sign-in or stop the notice from remembering your dismissal. The cookie notice can be shown again by clearing the monifyd_cookie_notice cookie."] },
      { heading: "Contact", paragraphs: ["For questions about cookies or personal information, email support@monifyd.com or read the Privacy Policy."] },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro: "Draft terms · Effective October 11, 2026. These terms describe the basic rules for using Monifyd. They should be reviewed and completed for the operating company's jurisdiction before publication.",
    sections: [
      { heading: "The service", paragraphs: ["Monifyd provides software for payment links, invoices, hosted checkout, payment detection, APIs, webhooks, reports, and related tools. Monifyd is non-custodial: funds are sent to merchant-controlled addresses, and Monifyd does not initiate customer payments or hold merchant balances."] },
      { heading: "Your responsibilities", bullets: ["Provide accurate account, invoice, wallet, and payment information.", "Keep login credentials and API keys secure; promptly revoke keys you no longer use.", "Use supported networks and confirm wallet addresses before sharing payment requests.", "Comply with laws and payment obligations that apply to your business and customers.", "Do not submit private keys, seed phrases, or wallet passwords to Monifyd."] },
      { heading: "Payments and availability", paragraphs: ["Blockchain transactions may be delayed, irreversible, or affected by network conditions. Payment status depends on data available from network providers and the confirmation rules configured by Monifyd. A payment request is not a guarantee that a transfer will settle successfully."] },
      { heading: "Fees, refunds, and plans", paragraphs: ["Monifyd currently adds no transaction fee to customer payments. Paid plans are billed through BACHS. Merchants handle customer refunds themselves. See Fees & Refunds for details."] },
      { heading: "Suspension and termination", paragraphs: ["We may restrict or suspend access where needed to protect the service, comply with law, investigate suspected abuse, or address a security issue. You can stop using the service and manage plan cancellation from the dashboard, subject to the plan billing period."] },
      { heading: "Changes and contact", paragraphs: ["We may update these terms as the service evolves. Continued use after an updated effective date means the updated terms apply to future use. Contact support@monifyd.com with questions."] },
    ],
  },
  security: {
    title: "Security",
    intro: "Protect API keys, payment events, user accounts, and transaction data.",
    sections: [
      { heading: "API keys", paragraphs: ["API keys are generated from cryptographically random bytes. Monifyd stores the SHA-256 hash, shows the full key once, and applies plan-based request limits. Keep keys on your server, never in browser code, and revoke keys you no longer use."] },
      { heading: "Payment events", paragraphs: ["Webhook deliveries include an HMAC-SHA256 signature over the timestamp and raw event body. Signing secrets are encrypted before storage and unavailable to authenticated database clients. Verify the signature before acting on an event, reject old timestamps, and deduplicate by event ID. Delivery retries can produce duplicates."] },
      { heading: "User accounts", paragraphs: ["Dashboard sign-in uses Supabase authentication. Workspace roles determine what members can do, and database row-level security scopes access to workspace records. Service-role credentials are used server-side and must not be exposed to the browser."] },
      { heading: "Transaction data", paragraphs: ["Payment status changes and their history are updated together. Settlement records, fee entries, notifications, and audit entries commit together or fail together. Database access policies restrict transaction records to the merchant workspace. Confirmation status depends on blockchain data from external network providers."] },
      { heading: "Webhook delivery", paragraphs: ["Webhook endpoints must use HTTPS. Before delivery, Monifyd rejects private and reserved IP ranges, pins the connection to the validated public IP, and does not follow redirects."] },
      { heading: "Non-custodial wallets", paragraphs: ["Funds go directly to merchant receiving addresses. Monifyd does not request or store private keys, seed phrases, or wallet passwords. Receiving addresses and transaction hashes are public blockchain data."] },
      { heading: "Report a security issue", paragraphs: ["Please report suspected vulnerabilities to security@monifyd.com. Include reproduction steps and the affected URL or component. Do not include customer secrets, API keys, private keys, or seed phrases."] },
      { heading: "Security limits", paragraphs: ["These measures reduce risk but cannot eliminate it. Blockchain transactions may be irreversible, and external RPC, email, hosting, and billing providers have their own security and availability characteristics."] },
    ],
  },
  "acceptable-use": {
    title: "Acceptable Use Policy",
    intro: "Use Monifyd lawfully and in ways that protect customers, merchants, networks, and the service.",
    sections: [
      { heading: "You may not use Monifyd to", bullets: ["Facilitate fraud, theft, sanctions evasion, money laundering, terrorist financing, or other illegal activity.", "Sell prohibited goods or services or violate another person's rights.", "Misrepresent payment status, merchant identity, fees, or refund terms to customers.", "Probe, disrupt, overload, or attempt unauthorized access to Monifyd, its providers, or another user's account.", "Use the API or webhooks to transmit malware, spam, or unlawful content.", "Submit private keys, seed phrases, passwords, or other wallet access credentials."] },
      { heading: "Enforcement", paragraphs: ["We may investigate suspected violations and restrict or suspend accounts, API keys, or payment requests where reasonably needed to protect users, the service, or comply with law. Contact support@monifyd.com if you believe a restriction was made in error."] },
    ],
  },
  "fees-refunds": {
    title: "Fees & Refunds",
    intro: "Understand current transaction fees, subscription pricing, and how refunds are handled.",
    sections: [
      { heading: "Payment service fee", paragraphs: ["Monifyd currently adds no transaction fee to customer payments. Customers pay the amount requested by the merchant. Historical payment records continue to show any fee that was charged at the time."] },
      { heading: "Merchant subscriptions", paragraphs: ["Dashboard and API subscriptions are separate products, with limits and prices listed on Pricing. Each paid subscription is billed independently through BACHS and can be cancelled separately. Cancellation takes effect according to the subscription period shown in the dashboard."] },
      { heading: "Customer refunds", paragraphs: ["Monifyd does not custody, initiate, or independently verify refund transfers. The merchant sends any refund from their own wallet and is responsible for confirming the destination, amount, network, and transaction."] },
      { heading: "Refund tracking", paragraphs: ["Merchants can record full or partial refunds against a confirmed payment and update each record's status. Recorded refund totals cannot exceed the amount received; failed refund attempts release the reserved amount. Where an email is supplied, Monifyd can send status updates based on the merchant's recorded status."] },
      { heading: "Contact", paragraphs: ["For a refund on a purchase, contact the merchant that received the payment. For Monifyd subscription or service questions, email support@monifyd.com."] },
    ],
  },
};
