# Stripe: only if the pilot charges

D23: Stripe bills the **organizer** only (a per-trip license or a seat plan), on the web only.
Travelers' fees stay a ledger the organizer keeps (paid, unpaid, refunded); guardians see their
balance and never enter a card. A free pilot needs none of this; skip this runbook until you
charge.

## 0. A decision before any account: can the entity use Stripe?

Stripe onboards businesses only in the countries it supports; check its list for the
operating entity's country first. The launch markets are the United States and Korea (D43). At
the time of writing, a **US entity** could open a Stripe account and bill organizers in both
markets (cards from Korea included), while a **Korean entity** could not open one and would
need a local processor for Korean customers. Which entity bills is your choice (ADR-0010, §29
question 1); if it is a Korean entity, choosing the processor is a new decision that
supersedes D23's provider. Tell engineering; the billing code is not written yet
(`billing.stripe`, deferred), so nothing has to be undone.

## 1. Sandbox first (architecture reference §26 P3)

1. Create the Stripe account for the operating entity; stay in a **sandbox**.
2. Products and prices: decide the plans and their prices first (§29 questions 4 to 6 and 12
   of the architecture reference: free-tier limits, credits, archive billing, refunds). Create
   them in the sandbox only.
3. Developers → API keys → create a **restricted key** with only what billing needs (Checkout
   Sessions write, Customers write, Prices read, Subscriptions read, Webhook endpoints read).
   Never use the unrestricted secret key in the app or in an agent prompt (§28.1).
4. Webhook endpoint: `https://api.staging.dev.voysemble.cfd/webhooks/stripe` for the sandbox
   (ADR-0008), events `checkout.session.completed`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy its signing secret.

```sh
pnpm exec wrangler secret put STRIPE_SECRET_KEY --env staging      # the restricted sandbox key
pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET --env staging  # the endpoint's signing secret
```

Engineering then builds the P3 slice and its exit test: success, failure, duplicate, delayed
and canceled payments all reconcile.

## 2. Tax is a launch gate

The architecture reference (§14) makes tax configuration a launch gate: registrations, the
product's tax treatment, customer location and exemptions are decided with qualified advice.
Stripe Tax can calculate what you configure; it does not decide it.

## 3. Live keys (only on your explicit approval)

Same steps with live keys and `https://api.voysemble.com/webhooks/stripe`, `--env production`.
A live price change or a refund is a production operation that needs your separate approval
each time (§28.2).
