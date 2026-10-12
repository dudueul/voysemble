// Copyright 2026- At Day. All rights reserved.
//
// Traveler fee ledger (D23, slice 027): what the organizer collects outside Voysemble, recorded
// per traveler so guardians can see their own balance. Amounts are integers in the currency's
// minor unit (won and yen have none; dollars and euros have cents). No card data anywhere here;
// the organizer's own license is Stripe's business (web only, hosted pages).

import { z } from '@hono/zod-openapi';
import { CalendarDate, Id, Timestamp } from './common';

export const Currency = z.enum(['KRW', 'USD', 'EUR', 'JPY']).openapi('Currency');
export type Currency = z.infer<typeof Currency>;

/** Minor-unit exponent: KRW and JPY have no fractional unit, USD and EUR have two digits. */
export function minorUnitsOf(currency: Currency): number {
  return currency === 'KRW' || currency === 'JPY' ? 0 : 2;
}

export const FeeStatus = z.enum(['unpaid', 'partial', 'paid', 'refunded']).openapi('FeeStatus');
export type FeeStatus = z.infer<typeof FeeStatus>;

/**
 * The status the ledger derives from three integers; the one rule for the server, the console
 * and the phones. Net = paid - refunded. Refunded when money went back and nothing net remains;
 * paid when net covers the amount due (or nothing is due); partial when something net was paid.
 */
export function feeStatusOf(
  amountDueMinor: number,
  paidMinor: number,
  refundedMinor: number,
): FeeStatus {
  const net = paidMinor - refundedMinor;
  if (refundedMinor > 0 && net <= 0) return 'refunded';
  if (amountDueMinor === 0 || net >= amountDueMinor) return 'paid';
  if (net > 0) return 'partial';
  return 'unpaid';
}

const Minor = z.number().int().min(0).max(1_000_000_000_000);

export const FeeRow = z
  .object({
    participationId: Id,
    displayName: z.string(),
    groupName: z.string().nullable(),
    currency: Currency,
    amountDueMinor: Minor,
    paidMinor: Minor,
    refundedMinor: Minor,
    dueOn: CalendarDate.nullable(),
    note: z.string().nullable(),
    status: FeeStatus,
    updatedAt: Timestamp,
    updatedByName: z.string(),
  })
  .openapi('FeeRow');
export type FeeRow = z.infer<typeof FeeRow>;

export const FeeLedger = z
  .object({
    currency: Currency,
    rows: z.array(FeeRow),
    /** Travelers on the roster with no fee row yet. */
    withoutFee: z.number().int(),
    totals: z.object({
      expectedMinor: Minor,
      collectedMinor: Minor,
      refundedMinor: Minor,
      paid: z.number().int(),
      partial: z.number().int(),
      unpaid: z.number().int(),
      refunded: z.number().int(),
    }),
  })
  .openapi('FeeLedger');
export type FeeLedger = z.infer<typeof FeeLedger>;

/** Set the fee for every traveler of the trip (keeps what was already paid). */
export const ApplyFeeRequest = z
  .object({
    amountDueMinor: Minor,
    currency: Currency.default('KRW'),
    dueOn: CalendarDate.nullable().default(null),
    /** True: only travelers without a row; false: overwrite every traveler's amount and due date. */
    onlyWithoutFee: z.boolean().default(true),
  })
  .openapi('ApplyFeeRequest');
export type ApplyFeeRequest = z.infer<typeof ApplyFeeRequest>;

/** Change one traveler's row; absent fields stay. */
export const UpdateFeeRequest = z
  .object({
    amountDueMinor: Minor.optional(),
    paidMinor: Minor.optional(),
    refundedMinor: Minor.optional(),
    dueOn: CalendarDate.nullable().optional(),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .openapi('UpdateFeeRequest');
export type UpdateFeeRequest = z.infer<typeof UpdateFeeRequest>;

/**
 * Bank export as CSV: columns `name` (the traveler's roster name), `paid` (a decimal amount in
 * the ledger's currency, e.g. 450000 or 120.50), optional `note`. `paid` is the total paid so far,
 * not an increment: importing the same file twice is harmless.
 */
export const FeeImportRequest = z
  .object({ csv: z.string().max(200_000) })
  .openapi('FeeImportRequest');
export type FeeImportRequest = z.infer<typeof FeeImportRequest>;

export const FeeImportResponse = z
  .object({
    applied: z.number().int(),
    /** Names that matched no traveler, in file order. */
    unmatched: z.array(z.string()),
    skipped: z.array(z.object({ line: z.number().int(), reason: z.string() })),
    ledger: FeeLedger,
  })
  .openapi('FeeImportResponse');
export type FeeImportResponse = z.infer<typeof FeeImportResponse>;

/** What a guardian sees of their traveler's fee (D23): their own balance and due date. */
export const GuardianFee = z
  .object({
    currency: Currency,
    amountDueMinor: Minor,
    paidMinor: Minor,
    refundedMinor: Minor,
    /** amountDue - paid + refunded, never below zero. */
    balanceMinor: Minor,
    dueOn: CalendarDate.nullable(),
    status: FeeStatus,
  })
  .openapi('GuardianFee');
export type GuardianFee = z.infer<typeof GuardianFee>;
