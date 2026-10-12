// Copyright 2026- At Day. All rights reserved.
// Facts (slice 063): the view state from the queries. A failed organizations or trips read in
// live mode is the offline state without a connection, else the error with its reference; a
// network failure after a successful load shows the last data offline, dated by its fetch; one
// before any load is the offline state; another failure is the error state; pending is loading.

import { describe, expect, it, vi } from 'vitest';
import { dashboardFixture } from '../../fixtures/korea-concert-tour';
import { ApiError } from '../../lib/api-client';
import { DashboardFetchError } from '../../lib/dashboard-api';
import { commandCenterState, type QuerySnapshot } from './CommandCenterPage';

const network = new ApiError(0, 'NETWORK', 'Network unavailable.', 'none');
const idle: QuerySnapshot = {
  isPending: false,
  isError: false,
  error: null,
  data: dashboardFixture,
  dataUpdatedAt: Date.parse('2026-12-31T06:00:00Z'),
};
const base = {
  live: true,
  resolving: false,
  contextError: null,
  retry: vi.fn(),
  now: '2026-12-31T06:12:00Z',
};

describe('commandCenterState', () => {
  it('ready with the data', () => {
    expect(commandCenterState({ ...base, query: idle })).toEqual({
      kind: 'ready',
      data: dashboardFixture,
    });
  });

  it('loading while resolving or pending', () => {
    expect(commandCenterState({ ...base, resolving: true, query: idle }).kind).toBe('loading');
    expect(
      commandCenterState({ ...base, query: { ...idle, isPending: true, data: undefined } }).kind,
    ).toBe('loading');
  });

  it('a lost connection after a load: the last data under the banner, dated by its fetch', () => {
    const s = commandCenterState({ ...base, query: { ...idle, isError: true, error: network } });
    expect(s.kind).toBe('ready');
    if (s.kind !== 'ready') return;
    expect(s.data.offline).toBe(true);
    expect(s.data.now).toBe('2026-12-31T06:12:00Z');
    expect(s.data.lastSyncAt).toBe('2026-12-31T06:00:00.000Z');
    expect(s.data.alerts).toBe(dashboardFixture.alerts);
  });

  it('a lost connection before any load: offline; the organizations read too, in live mode only', () => {
    const retry = vi.fn();
    const s = commandCenterState({
      ...base,
      retry,
      query: { ...idle, isError: true, error: network, data: undefined },
    });
    expect(s.kind).toBe('offline');
    if (s.kind === 'offline') s.retry();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(commandCenterState({ ...base, contextError: network, query: idle }).kind).toBe(
      'offline',
    );
    expect(
      commandCenterState({ ...base, live: false, contextError: network, query: idle }).kind,
    ).toBe('ready');
  });

  it('any other failure: the error with its reference', () => {
    const server = new ApiError(500, 'INTERNAL', 'boom', 'corr-500');
    expect(
      commandCenterState({ ...base, query: { ...idle, isError: true, error: server } }),
    ).toMatchObject({ kind: 'error', correlationId: 'corr-500' });
    expect(
      commandCenterState({
        ...base,
        query: { ...idle, isError: true, error: new DashboardFetchError('corr-fx') },
      }),
    ).toMatchObject({ kind: 'error', correlationId: 'corr-fx' });
    expect(commandCenterState({ ...base, contextError: server, query: idle })).toMatchObject({
      kind: 'error',
      correlationId: 'corr-500',
    });
    expect(
      commandCenterState({ ...base, query: { ...idle, isError: true, error: new Error('x') } }),
    ).toMatchObject({ kind: 'error', correlationId: 'unknown' });
  });
});
