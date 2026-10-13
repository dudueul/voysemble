# Legal, policy and the pilot trip

Covers step 9 of `README.md`. The travelers on a school trip include minors, and the product
handles their names, photos, health notes, document scans and (on the device) their location.
This runbook lists the questions to settle and the documents to have before real people's data
enters the system. It is a checklist for you and your counsel, not legal advice.

## 1. Questions the architecture reference says must be answered first (§29)

1. Which legal entity operates Voysemble and owns the store and payment accounts?
2. Which domains and app-store accounts are controlled (`cloudflare.md`, `apple.md`,
   `google.md`)?
3. What minimum age and school or guardian model will launch?
4. The free tier's retention and participant limits.
5. The credit conversion rule for group plans.
6. When paid archive billing begins relative to included retention.
7. Which countries and app storefronts are in scope?
8. Which vendors are approved (flight data, maps, email, SMS, AI)?
9. Which synthetic photographs may be published, and the rights record for them.
10. What incident coverage and support response one founder can provide.
11. Data residency or school-contract obligations.
12. Refund, grace, cancellation and consumer billing disclosures.

For a free pilot, 4 to 6 and 12 can wait; 1, 3, 7, 8, 10 and 11 cannot. Question 7 is answered
by D43: the United States and Korea first, Europe afterwards (ADR-0010).

## 2. Topics to bring to counsel

Each names the product fact counsel will ask about. Korea and the United States are the
launch markets (D43); bring both lists to counsel licensed for each.

### Korea

- **Children's data and guardian consent.** Korea's Personal Information Protection Act
  requires a legal representative's consent to process the personal information of children
  under 14. The product's guardian is bound to one traveler by an invite code (D12), writes the
  care note (D27) and reads status only (D13). Confirm whether that flow, plus a signed consent
  form collected by the school, satisfies the requirement, and what the consent text must say.
- **Location.** The phone compares its position with the meeting point inside a meeting window
  the traveler joins; coordinates never leave the phone and the server stores none (D15,
  `meeting-windows.md`). Ask whether Korea's location information act requires a report or
  registration for this design, given that the server never receives a position.
- **Cross-border processing.** Data is processed and stored on Cloudflare's network (D1,
  Durable Objects, R2) and, for translation, Workers AI (ADR-0006). Ask what the privacy policy
  must disclose about transfers abroad under PIPA.
- **Health information.** Care notes (allergies, medications) are sealed at rest, revealed only
  on an audited action (D27, `care-notes.md`). Ask whether they count as sensitive information
  needing separate consent.
- **Document scans.** Passport and consent scans are tier 3: sealed, console only, step-up
  confirmation to view, every view on the traveler's timeline (`documents.md`). Ask whether
  collecting passport copies is necessary, or whether a "collected" mark without a scan is
  enough (the product supports both).
- **Retention and deletion.** D20: 90 days after the trip, then shred; a person can be removed at
  once. The automatic trip-wide shred is not built yet (`README.md`); agree the manual process
  for the pilot.
- **User content.** Chat and photos are moderated by leaders and organizers (slice 065, D18).
  Confirm the terms cover removal and reporting.

### United States

- **Children under 13 (COPPA).** Travelers can be younger than 13. When a school is the
  customer, ask whether the school may consent on parents' behalf for this use (an educational
  trip, no commercial use of the data) or whether the guardian's own consent through the
  invite is needed, and what the notice to parents must say. The product collects no
  advertising identifiers and runs no analytics or ad SDKs.
- **Student records (FERPA) and state student privacy laws.** Where a school or district is the
  customer, the roster, health notes and document scans may be education records. Ask what the
  agreement with the school must contain (acting as a "school official", use limits, deletion
  on request, breach notice) and which state laws apply to the first customers' states.
- **State consumer privacy laws** (California's first among them): the privacy policy's
  disclosures and the rights to access and delete. The product sells no data and shares none
  for advertising.
- **Email.** Sign-in links, digests and incident emails are transactional; confirm none needs
  marketing-email treatment.

### Europe (later phase, D43)

The GDPR, EU storefronts and an EU data home are the European phase. Two items to keep in view
now: a US or Korean group traveling in Europe is processed by a US or Korean organizer (ask
counsel whether anything applies during such a trip), and nothing built now should make an EU
data home impossible later (ADR-0010).

## 3. Documents to have

| Document | State in the repo | To do |
|---|---|---|
| Privacy policy (KO, EN) | Drafts on the public site (`apps/public-web/src/site/legal.ts`, `/privacy/`) | Counsel review; publish the reviewed text |
| Terms of service (KO, EN) | Drafts (`/terms/`) | Counsel review |
| Guardian consent form | None | Write with counsel; the school collects it before invites go out |
| School or organizer agreement (data processing) | None | Who is controller and processor, retention, deletion, breach notice |
| Store privacy answers | None | `apple.md` §4, `google.md` §5, from the same facts |
| Parent notice for US travelers under 13 | None | With counsel (COPPA), alongside the guardian consent form |

The public site's legal pages (`/privacy/`, `/terms/` and their Korean twins under `/ko/`) are
drafts until reviewed (`web.public-site.legal-drafts` in `feature-status.json`).

## 4. The pilot trip itself

- **One trip, one school, a small group.** Leaders and the organizer are briefed in person;
  travelers install from TestFlight or Play internal testing on a set day before departure.
- **Rehearse on staging first** with the demonstration script (`cloudflare.md` §8), then run the
  real trip on production.
- **Support plan.** Who answers a leader's call at 03:00 in the destination's time zone (§29
  question 10), and what happens if the API is unreachable: the phones keep the last plan and
  queue acknowledgments and head counts (D28, ADR-0009), and leaders keep a paper roster.
- **Before departure, engineering's must-haves** (`README.md`): the live head count card on
  Today, the durable offline pack, push.
- **After the trip**: export what the school needs (roster, fee ledger as CSV), then run the
  agreed deletion; keep the evidence.
