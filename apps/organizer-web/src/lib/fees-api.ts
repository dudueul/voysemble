// Copyright 2026- At Day. All rights reserved.
//
// Fee ledger on the API (D23, slice 027): queries, mutations, and money formatting for the
// Billing page. Amounts travel as integers in minor units; the console shows them in the
// currency's own format and reads what the organizer types in major units.

import { queryOptions } from '@tanstack/react-query';
import {
  type ApplyFeeRequest,
  type Currency,
  type FeeImportResponse,
  type FeeLedger,
  type FeeRow,
  minorUnitsOf,
  type UpdateFeeRequest,
} from '@voysemble/contracts';
import { api } from './api-client';

export const feesQuery = (orgId: string, tripId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'trips', tripId, 'fees'],
    queryFn: async () => api<FeeLedger>(`/v1/orgs/${orgId}/trips/${tripId}/fees`),
  });

export const fees = {
  apply: (orgId: string, tripId: string, body: ApplyFeeRequest) =>
    api<FeeLedger>(`/v1/orgs/${orgId}/trips/${tripId}/fees/apply`, {
      method: 'POST',
      body,
    }),
  update: (orgId: string, tripId: string, participationId: string, body: UpdateFeeRequest) =>
    api<FeeRow>(`/v1/orgs/${orgId}/trips/${tripId}/fees/${participationId}`, {
      method: 'PATCH',
      body,
    }),
  import: (orgId: string, tripId: string, csv: string) =>
    api<FeeImportResponse>(`/v1/orgs/${orgId}/trips/${tripId}/fees/import`, {
      method: 'POST',
      body: { csv },
    }),
};

/** Minor units in the currency's own format: ₩450,000, $1,234.50. */
export function formatMoney(minor: number, currency: Currency): string {
  const exp = minorUnitsOf(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(minor / 10 ** exp);
}

/** What the organizer typed (major units, separators allowed) to minor units; null when not a number. */
export function parseMoney(input: string, currency: Currency): number | null {
  const cleaned = input.replace(/[,\s₩$€¥]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 10 ** minorUnitsOf(currency));
}

/** Major-unit text for an input's initial value, without separators. */
export function toMajor(minor: number, currency: Currency): string {
  const exp = minorUnitsOf(currency);
  return exp === 0 ? String(minor) : (minor / 10 ** exp).toFixed(exp);
}
