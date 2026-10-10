// Copyright 2026- At Day. All rights reserved.
//
// Dashboard data source. Slice 003: deterministic fixture with simulated states so every UI
// state is reachable without a backend (`?state=`). Later slices swap `fetchDashboard` for the
// generated API client; the `Dashboard` shape is the contract the view depends on.

import { z } from 'zod';
import { type Dashboard, dashboardFixture } from '../fixtures/korea-concert-tour';

export const DashboardState = z.enum(['live', 'loading', 'empty', 'error', 'offline']);
export type DashboardState = z.infer<typeof DashboardState>;

export class DashboardFetchError extends Error {
  readonly code = 'DASHBOARD_UNAVAILABLE' as const;
  constructor(readonly correlationId: string) {
    super('Dashboard could not be loaded.');
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchDashboard(state: DashboardState): Promise<Dashboard> {
  switch (state) {
    case 'loading':
      return new Promise<Dashboard>(() => undefined); // never resolves; exercises the skeleton
    case 'error':
      await delay(50);
      throw new DashboardFetchError('corr-fixture-error');
    case 'empty':
      await delay(50);
      return {
        ...dashboardFixture,
        trips: [],
        activeTripId: null,
        movements: [],
        alerts: [],
        headcount: [],
        announcements: [],
      };
    case 'offline':
      await delay(50);
      return { ...dashboardFixture, offline: true, lastSyncAt: '2026-12-31T04:02:00Z' };
    default:
      await delay(120);
      return dashboardFixture;
  }
}
