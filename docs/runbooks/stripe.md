# Stripe: only if the pilot charges

D23: Stripe bills the **organizer** only (a per-trip license or a seat plan), on the web only.
Travelers' fees stay a ledger the organizer keeps (paid, unpaid, refunded); guardians see their
balance and never enter a card. A free pilot needs none of this; skip this runbook until you
charge.

## 0. A decision before any account: can the entity use Stripe?

Stripe onboards businesses only in the countries it supports. Check Stripe's list of supported
countries for the operating legal entity's country before anything else. At the time of
writing, South Korea was not on it; if the entity is Korean, the choices are a supported-country
entity, or a local payment processor instead of Stripe. Either is a new decision (an ADR that
supersedes D23's provider), not a setup step. Tell engineering which; the billing code is not
written yet (`billing.stripe`, deferred), so nothing has to be undone.

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
