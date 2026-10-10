// Copyright 2026- At Day. All rights reserved.
// Itinerary data source. Fixture with simulated states (same contract as dashboard-api).

import { type Itinerary, itineraryFixture } from '../fixtures/itinerary';
import { DashboardFetchError, type DashboardState } from './dashboard-api';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchItinerary(state: DashboardState): Promise<Itinerary> {
  switch (state) {
    case 'loading':
      return new Promise<Itinerary>(() => undefined);
    case 'error':
      await delay(50);
      throw new DashboardFetchError('corr-fixture-itinerary');
    case 'empty':
      await delay(50);
      return { ...itineraryFixture, days: [], events: [] };
    default:
      await delay(100);
      return itineraryFixture;
  }
}
