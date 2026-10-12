// Copyright 2026- At Day. All rights reserved.
//
// Traveler fee ledger routes (D23, slice 027). Owner or organizer only: the ledger is the
// organizer's record of money collected outside Voysemble. Guardians read their own balance
// through the guardian status route; nobody pays through the API.

import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  ApplyFeeRequest,
  FeeImportRequest,
  FeeImportResponse,
  FeeLedger,
  FeeRow,
  minorUnitsOf,
  UpdateFeeRequest,
} from '@voysemble/contracts';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, requireOrgRole } from '../auth/middleware';
import type { AppEnv } from '../env';
import { CsvError, parseCsv } from '../lib/csv';
import { orgObject } from '../org/client';
import { ERROR_RESPONSES, SESSION_SECURITY } from './openapi-common';
import { TripParams } from './trips';

const FeeParams = TripParams.extend({ participationId: z.uuid() });

const listRoute = createRoute({
  method: 'get',
  path: '/v1/orgs/{orgId}/trips/{tripId}/fees',
  tags: ['fees'],
  summary: 'The traveler fee ledger with totals (owner, organizer)',
  security: SESSION_SECURITY,
  request: { params: TripParams },
  responses: {
    200: { description: 'Ledger.', content: { 'application/json': { schema: FeeLedger } } },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const applyRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/fees/apply',
  tags: ['fees'],
  summary: 'Set the fee for every traveler (keeps what was paid)',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: ApplyFeeRequest } } },
  },
  responses: {
    200: {
      description: 'Ledger after the change.',
      content: { 'application/json': { schema: FeeLedger } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/orgs/{orgId}/trips/{tripId}/fees/{participationId}',
  tags: ['fees'],
  summary: "Change one traveler's fee row (amount, paid, refunded, due date, note)",
  security: SESSION_SECURITY,
  request: {
    params: FeeParams,
    body: { content: { 'application/json': { schema: UpdateFeeRequest } } },
  },
  responses: {
    200: { description: 'The row.', content: { 'application/json': { schema: FeeRow } } },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

const importRoute = createRoute({
  method: 'post',
  path: '/v1/orgs/{orgId}/trips/{tripId}/fees/import',
  tags: ['fees'],
  summary: 'Import paid totals from a bank CSV (columns name, paid, optional note)',
  description:
    'Amounts are decimal numbers in the ledger currency (450000 for won, 120.50 for dollars) and mean the total paid so far, so a repeated import is harmless. Names match roster names ignoring case and spacing; unmatched names are returned, never guessed.',
  security: SESSION_SECURITY,
  request: {
    params: TripParams,
    body: { content: { 'application/json': { schema: FeeImportRequest } } },
  },
  responses: {
    200: {
      description: 'Outcome and the ledger.',
      content: { 'application/json': { schema: FeeImportResponse } },
    },
    400: ERROR_RESPONSES[400],
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    404: ERROR_RESPONSES[404],
    500: ERROR_RESPONSES[500],
  },
});

/** A decimal in major units ("450000", "120.50") to minor units for the currency; null when not a number. */
export function toMinor(value: string, exponent: number): number | null {
  const cleaned = value.replace(/[,\s₩$€¥]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 10 ** exponent);
}

export function mountFeeRoutes(app: OpenAPIHono<AppEnv>): void {
  const staff = async (
    c: Parameters<Parameters<typeof app.openapi>[1]>[0],
    orgId: string,
    tripId: string,
  ) => {
    const auth = requireAuth(c);
    const access = await requireOrgRole(c.env, auth, orgId, 'organizer');
    const org = await orgObject(c.env, orgId);
    if (!(await org.getTrip(tripId))) throw new HTTPException(404, { message: 'Trip not found.' });
    return { org, byName: access.role === 'owner' ? 'Owner' : 'Organizer' };
  };

  app.openapi(listRoute, async (c) => {
    const { orgId, tripId } = c.req.valid('param');
    const { org } = await staff(c, orgId, tripId);
    return c.json(await org.listFees(tripId), 200);
  });

  app.openapi(applyRoute, async (c) => {
    const { orgId, tripId } = c.req.valid('param');
    const { org, byName } = await staff(c, orgId, tripId);
    return c.json(await org.applyFee(tripId, c.req.valid('json'), byName), 200);
  });

  app.openapi(updateRoute, async (c) => {
    const { orgId, tripId, participationId } = c.req.valid('param');
    const { org, byName } = await staff(c, orgId, tripId);
    const r = await org.updateFee(tripId, participationId, c.req.valid('json'), byName);
    if ('notFound' in r) throw new HTTPException(404, { message: 'Traveler not found.' });
    return c.json(r, 200);
  });

  app.openapi(importRoute, async (c) => {
    const { orgId, tripId } = c.req.valid('param');
    const { org, byName } = await staff(c, orgId, tripId);
    let parsed: ReturnType<typeof parseCsv>;
    try {
      parsed = parseCsv(c.req.valid('json').csv);
    } catch (e) {
      throw new HTTPException(400, { message: e instanceof CsvError ? e.message : 'Bad CSV.' });
    }
    const header = parsed.header.map((h) => h.trim().toLowerCase());
    if (!header.includes('name') || !header.includes('paid')) {
      throw new HTTPException(400, { message: 'CSV needs "name" and "paid" columns.' });
    }
    const exponent = minorUnitsOf((await org.listFees(tripId)).currency);
    const skipped = [...parsed.rejected];
    const entries: { name: string; paidMinor: number; note: string | null }[] = [];
    for (const r of parsed.rows) {
      const values = Object.fromEntries(
        Object.entries(r.values).map(([k, v]) => [k.trim().toLowerCase(), v]),
      );
      const name = (values.name ?? '').trim();
      const paid = toMinor(values.paid ?? '', exponent);
      if (!name) {
        skipped.push({ line: r.line, reason: 'name is empty' });
        continue;
      }
      if (paid === null) {
        skipped.push({ line: r.line, reason: 'paid is not a number' });
        continue;
      }
      entries.push({ name, paidMinor: paid, note: (values.note ?? '').trim() || null });
    }
    const result = await org.importPayments(tripId, entries, byName);
    return c.json({ ...result, skipped, ledger: await org.listFees(tripId) }, 200);
  });
}
