// Copyright 2026- At Day. All rights reserved.
// Itinerary data source. Fixture with simulated states (same contract as dashboard-api) for
// sample mode and `?state=`; slice 017 adds the live mapping to and from the API contract so the
// editor reducer keeps its shape (pax 'all' ↔ null, optional end/note ↔ null).

import type {
  Itinerary as ApiItinerary,
  ItineraryEvent as ApiItineraryEvent,
  ItineraryEventInput,
  ItineraryProposal,
  ProposalList,
} from '@voysemble/contracts';
import { type Itinerary, type ItineraryEvent, itineraryFixture } from '../fixtures/itinerary';
import { api } from './api-client';
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

/* ---------- Live mapping (slice 017) ---------- */

export function fromApiEvent(e: ApiItineraryEvent): ItineraryEvent {
  return {
    id: e.id,
    tripId: e.tripId,
    date: e.date,
    start: e.start,
    ...(e.end ? { end: e.end } : {}),
    timeZone: e.timeZone,
    kind: e.kind,
    title: e.title,
    place: e.place,
    pax: e.pax === null ? 'all' : e.pax,
    status: e.status,
    ...(e.note ? { note: e.note } : {}),
    order: e.order,
    published: e.published,
  };
}

export function toApiInput(e: ItineraryEvent): ItineraryEventInput {
  return {
    date: e.date,
    start: e.start,
    end: e.end ?? null,
    timeZone: e.timeZone,
    kind: e.kind,
    title: e.title,
    place: e.place,
    pax: e.pax === 'all' ? null : e.pax,
    status: e.status,
    note: e.note ?? null,
    order: e.order,
  };
}

export function fromApiItinerary(it: ApiItinerary): Itinerary {
  return {
    tripId: it.tripId,
    tripName: it.tripName,
    startDate: it.startDate,
    endDate: it.endDate,
    revision: it.revision,
    days: it.days,
    events: it.events.map(fromApiEvent),
    live: true,
  };
}

export const itineraryApi = {
  get: async (orgId: string, tripId: string) =>
    fromApiItinerary(await api<ApiItinerary>(`/v1/orgs/${orgId}/trips/${tripId}/itinerary`)),
  upsert: (orgId: string, tripId: string, e: ItineraryEvent) =>
    api<ApiItineraryEvent>(`/v1/orgs/${orgId}/trips/${tripId}/itinerary/events/${e.id}`, {
      method: 'PUT',
      body: toApiInput(e),
    }),
  remove: (orgId: string, tripId: string, id: string) =>
    api<undefined>(`/v1/orgs/${orgId}/trips/${tripId}/itinerary/events/${id}`, {
      method: 'DELETE',
    }),
  publish: async (orgId: string, tripId: string, expectedRevision: number) =>
    fromApiItinerary(
      await api<ApiItinerary>(`/v1/orgs/${orgId}/trips/${tripId}/itinerary/publish`, {
        method: 'POST',
        body: { expectedRevision },
      }),
    ),
};

/* ---------- Leader change proposals (slice 018) ---------- */

export const proposalsApi = {
  list: async (orgId: string, tripId: string) =>
    (await api<ProposalList>(`/v1/orgs/${orgId}/trips/${tripId}/itinerary/proposals`)).proposals,
  decide: (
    orgId: string,
    tripId: string,
    proposalId: string,
    decision: 'accept' | 'reject',
    note: string | null,
  ) =>
    api<ItineraryProposal>(
      `/v1/orgs/${orgId}/trips/${tripId}/itinerary/proposals/${proposalId}/decide`,
      { method: 'POST', body: { decision, note } },
    ),
};

/** "start 09:00 → 08:30 · note: Gate opens early." for the proposal card. */
export function describePatch(patch: ItineraryProposal['patch']): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    parts.push(`${k}: ${v === null ? '—' : String(v)}`);
  }
  return parts.join(' · ');
}
