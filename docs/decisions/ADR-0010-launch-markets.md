# ADR-0010: Launch markets: the United States and Korea first, Europe afterwards

Status: accepted (2026-10-13)

## Context

The product was designed for group trips from Korea (the sample is a Korean school's concert
tour to Rome) with English and Korean throughout (ADR-0008: KO, EN; Japanese dropped). The
launch runbooks (`docs/runbooks/`, slice 084) needed to know which countries' law, stores,
payment rails and data rules apply first. The founder decided (2026-10-13): **the United States
and Korea are the initial primary markets; Europe comes afterwards.**

## Decision

1. **Organizers, schools and storefronts**: the first customers are organizations in the United
   States and in Korea. The apps are published to the US and Korean App Store and Google Play
   storefronts first; other storefronts stay off until their phase.
2. **Languages** stay English and Korean (ADR-0008). English is written for US readers.
3. **Trips may go anywhere.** A market is where the organizer and the travelers are from, not
   where the trip goes: a US or Korean group traveling to Europe is in scope now.
4. **Law to design for now**: Korea's Personal Information Protection Act (consent of a legal
   representative for children under 14; disclosure of transfers abroad) and its location
   information act; in the United States, COPPA (children under 13), FERPA and state student
   privacy laws where a school is the customer, and state consumer privacy laws such as
   California's. The product's existing rules already lean this way: no ads, no tracking, no
   location on the server (D15), status not coordinates for guardians (D13), sealed health notes
   and scans (D27), retention with shredding (D20). Counsel confirms the gaps
   (`docs/runbooks/legal-and-pilot.md`).
5. **Europe** (the GDPR, EU storefronts, EU data residency options) is a later phase. Nothing
   built now may block it: no new data flow that could not be given an EU home later, and the
   encryption tiers (ADR-0001) and per-organization storage (ADR-0002) stay as they are.
6. **Payments**: Stripe remains the provider (D23) for organizers. Which legal entity bills is
   the founder's open choice (architecture reference §29 question 1); a US entity can use Stripe
   for customers in both markets, a Korean entity cannot open a Stripe account and would need a
   local processor for Korean customers. Currencies already supported in the fee ledger and its
   formatting: KRW and USD (EUR and JPY format too).

## Consequences

- The runbooks gain a US section and mark European items as later (`legal-and-pilot.md`,
  `stripe.md`, `apple.md`, `google.md`).
- Dates in the console follow the reader's locale before the US launch (US month/day order);
  the console shows ISO dates today (`console-i18n.md`, not done).
- No change to code or storage now.
