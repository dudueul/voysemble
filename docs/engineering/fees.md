# Traveler fee ledger (slice 027, D23)

The organizer collects trip fees outside Voysemble (bank transfer, cash) and records them per
traveler; guardians see their own balance and due date on the phone. No card data, no payments
through the API; the organizer's own license is Stripe's business on the web (deferred). Exercised
by `apps/api-worker/test/fees.test.ts`, the live Billing case in `sections.test.tsx`,
`apps/organizer-web/src/lib/fees-api.test.ts`, `apps/organizer-web/e2e/billing.spec.ts`, and
`mobile/core/.../today/GuardianModelTest.kt` (balance line).

## Storage (OrgDurableObject, schema version 10)

| Table | Columns | Notes |
|---|---|---|
| `fees` | participation_id (PK), trip_id, currency, amount_due_minor, paid_minor, refunded_minor, due_on, note, updated_at, updated_by_name | One row per traveler, created by "apply" or by the first update. Amounts are integers in the currency's minor unit (KRW and JPY: none; USD and EUR: cents). Tier 1 (operational): amounts the organizer typed, no bank identifiers. |

Status is derived, never stored, by one rule shared by the server, the console and the phones
(`feeStatusOf` in `@voysemble/contracts`): net = paid − refunded; `refunded` when money went back
and nothing net remains; `paid` when net covers the amount due (or nothing is due); `partial`
when something net was paid; `unpaid` otherwise.

## Routes (owner, organizer)

| Route | Behaviour |
|---|---|
| `GET .../fees` | `FeeLedger`: rows in roster order, `withoutFee` (travelers with no row), totals (expected, collected = Σ max(0, paid − refunded), refunded, counts per status), the ledger currency (first row's, KRW before any). |
| `POST .../fees/apply` | `{ amountDueMinor, currency = KRW, dueOn = null, onlyWithoutFee = true }`: a row for every traveler. With `onlyWithoutFee` the rows that exist are untouched; without it every amount and due date is overwritten. Paid amounts always stay. |
| `PATCH .../fees/{participationId}` | `{ amountDueMinor?, paidMinor?, refundedMinor?, dueOn?, note? }`: absent fields stay; a traveler without a row gets one (amount due 0). 404 for an unknown id or a non-traveler. |
| `GET .../fees/export.csv` (slice 066) | The ledger as a file: `text/csv; charset=utf-8` with a byte-order mark (a Korean spreadsheet opens it as UTF-8), `Content-Disposition: attachment; filename="fees-<trip-slug>-<date>.csv"` (the date in the trip's zone), `no-store`. One row per traveler in roster order, those without a fee row included with empty amounts and status `no_fee`: `name, group, currency, amount_due, paid, refunded, balance, status, due_on, note`; amounts in the currency's major units (`450000`, `120.50`); balance = max(0, due − paid + refunded); RFC 4180 quoting (`"Lee, Hana"`). `feeLedgerCsv` and `fileSlug` are pure. |
| `POST .../fees/import` | `{ csv }` with columns `name`, `paid`, optional `note`. `paid` is a decimal in the ledger currency and means the total paid so far (idempotent). Names match roster names ignoring case and spacing; unmatched names and bad rows are returned, never guessed. 400 without the two columns. |

Travelers, guardians and leaders get 403 on every fee route. The guardian reads their traveler's
fee on `GET .../guardian/status` as `fee` (`GuardianFee`: amounts, balance = max(0, due − paid +
refunded), due date, status), null until a row exists.

## Console

Billing is live when the organization has a trip ("Live" chip; the plan card keeps its
"Sample data" chip until Stripe lands). The ledger card shows the collected meter and counts,
the "Set the fee" form (amount in major units with separators allowed, currency, due date, the
"only travelers without a fee" switch), and a row per traveler with an editable paid amount
("Paid by {name}", "Save payment for {name}") and the derived status chip. The import card takes
the bank CSV and reports "n rows applied · unmatched: … · k skipped". Money renders through
`Intl.NumberFormat` from minor units (`formatMoney`); typed amounts parse through `parseMoney`.

The Billing page's ledger card carries "Export CSV" (slice 066), a plain link to the route with
the session cookie, so the browser saves the file. The People page's roster table gains a "Fee"
column once the ledger has loaded (`buildPeople(entries, ledger)` attaches `fee` to travelers:
the status chip and "₩250,000 due" while something is owed; "No fee" for a traveler without a
row; "—" for guardians and leaders); the sample roster has no column.

## Phones

`GuardianStatusDto.fee` → `feeLineOf` (core): "Balance ₩450,000 · due 2026-11-30", "Paid in
full", "₩450,000 refunded" (Korean: "잔액 ₩450,000 · 2026-11-30까지", "납부 완료", "… 환불됨");
`formatMinor` groups thousands without platform formatters. The guardian card carries the line
under the detail on Android and iOS; the sample guardian status carries a partial payment so the
captures show it.

## Facts established by tests

- Worker: an empty ledger lists three travelers without fee and zero totals, and the guardian
  sees no fee; applying ₩450,000 due 2026-11-30 creates three unpaid rows and the totals; a
  payment makes Minji paid (updated by "Owner"); unknown ids and a guardian row are 404; a
  second apply keeps the paid amount and only fills missing rows; an overwrite changes the
  amount, not the payment (partial); a bank CSV with loose names applies two rows, reports
  "Nobody" unmatched and a non-number row skipped, sets the note, is idempotent, and needs the
  two columns; a refund derives `refunded` and the guardian sees the full `GuardianFee`;
  travelers and guardians are 403 everywhere. `feeStatusOf` and `toMinor` cases.
- Console unit: money formats and parses per currency; the live Billing page shows "Live", the
  collected line, the counts, "Unpaid", saves a payment with the right body and refetches to
  "Paid" and the new total, and reports an import with its unmatched name.
- Browser: with three travelers the page reads "No fee set yet" and "3 travelers have no fee
  yet."; applying ₩450,000 due 2026-11-30 reports "Fee set for 3 travelers." with three unpaid
  rows and "₩0 of ₩1,350,000 collected"; saving Minji's payment reads "Saved Minji Park." and
  "₩450,000 of ₩1,350,000 collected"; importing a CSV with Juho and a stranger reads "1 row
  applied · unmatched: Nobody" and "1 paid · 1 partial · 1 unpaid · 0 refunded". Capture
  `billing-live.png`.
- Core: `formatMinor` for KRW, USD, EUR, JPY; the fee line for unpaid (EN and KO), paid and
  refunded; the card carries the balance only when a fee exists.
- Export (slice 066), worker: with Minji paid (a note), Juho partial and Hana without a row, the
  file carries the content type, the attachment name with the trip slug and the day, `no-store`,
  the byte-order mark, the header, the three lines in roster order (Hana quoted) and a closing
  line break; a guardian and a traveler are 403; dollars print with cents and a quoted note is
  doubled; the slug of a Korean name falls back to "trip". Console unit: the People page shows
  "Paid", "—" and "No fee" from a stubbed ledger; the Billing page's export link has the route's
  href; `buildPeople` attaches the fee to travelers only when a ledger is given. Browser: the
  download's name and its first lines on the Billing page; the Fee column with three "No fee" on
  the People page.

## Not done

Stripe for the organizer's license (D23, web only), per-traveler Stripe Checkout links; the
export in the organizer's language (the headers are English column names for a spreadsheet);
the fee on the person card.
