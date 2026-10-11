// Copyright 2026- At Day. All rights reserved.
//
// Synthetic fixture: Korea Concert Tour, 38 travelers, two buses, ICN -> FCO, Dec 28 2026 to
// Jan 9 2027. "Now" is frozen at Day 4 (2026-12-31 07:12 Rome) so screenshots are stable.
// No real institution, person, flight, or venue is referenced. Flight numbers use the DEMO prefix.
// Every record shape here is a placeholder for the generated API models of later slices.

export type TripStatus = 'active' | 'planning' | 'completed';
export type MovementKind = 'flight' | 'bus' | 'meal' | 'activity' | 'hotel' | 'meeting';
export type MovementStatus = 'scheduled' | 'delayed' | 'done' | 'in_progress';
export type AlertSeverity = 'red' | 'amber' | 'info';

export interface Trip {
  id: string;
  name: string;
  destination: string;
  timeZone: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  status: TripStatus;
  /** Hue for synthetic cover art (no licensed photo yet; doc 01 §15). */
  coverHue: number;
}

export interface Movement {
  id: string;
  tripId: string;
  kind: MovementKind;
  title: string;
  place: string;
  /** ISO instant. */
  at: string;
  timeZone: string;
  status: MovementStatus;
  pax: number;
  note?: string;
}

export interface Alert {
  id: string;
  tripId: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  at: string;
  actions: string[];
}

export interface HeadcountGroup {
  label: string;
  checkedIn: number;
  expected: number;
}

export interface Announcement {
  id: string;
  title: string;
  acknowledged: number;
  total: number;
  publishedAt: string;
}

export interface Dashboard {
  organizerName: string;
  organizationName: string;
  now: string;
  lastSyncAt: string;
  offline: boolean;
  /** True when assembled from the API (slice 014); the fixture leaves it unset. */
  live?: boolean;
  trips: Trip[];
  activeTripId: string | null;
  movements: Movement[];
  alerts: Alert[];
  headcount: HeadcountGroup[];
  announcements: Announcement[];
}

export const FROZEN_NOW = '2026-12-31T06:12:00Z'; // 07:12 Europe/Rome, 15:12 Asia/Seoul

const ROME = 'Europe/Rome';
const SEOUL = 'Asia/Seoul';

export const trips: Trip[] = [
  {
    id: 'trip_korea_concert_tour',
    name: 'Korea Concert Tour',
    destination: 'Rome, Italy',
    timeZone: ROME,
    startDate: '2026-12-28',
    endDate: '2027-01-09',
    travelerCount: 38,
    status: 'active',
    coverHue: 212,
  },
  {
    id: 'trip_japan_winter',
    name: 'Japan Winter Workshop',
    destination: 'Sapporo, Japan',
    timeZone: 'Asia/Tokyo',
    startDate: '2027-02-10',
    endDate: '2027-02-16',
    travelerCount: 24,
    status: 'planning',
    coverHue: 190,
  },
  {
    id: 'trip_study_tour',
    name: 'Spring Study Tour',
    destination: 'Busan, Korea',
    timeZone: SEOUL,
    startDate: '2027-04-13',
    endDate: '2027-04-17',
    travelerCount: 52,
    status: 'planning',
    coverHue: 32,
  },
];

const T = 'trip_korea_concert_tour';

export const movements: Movement[] = [
  {
    id: 'mv_breakfast',
    tripId: T,
    kind: 'meal',
    title: 'Breakfast',
    place: 'Hotel de la Ville, restaurant',
    at: '2026-12-31T06:30:00Z',
    timeZone: ROME,
    status: 'in_progress',
    pax: 38,
  },
  {
    id: 'mv_lobby',
    tripId: T,
    kind: 'meeting',
    title: 'Meet in the hotel lobby',
    place: 'Hotel de la Ville, lobby',
    at: '2026-12-31T06:30:00Z',
    timeZone: ROME,
    status: 'scheduled',
    pax: 38,
    note: 'Moved from 07:00 by the tour leader',
  },
  {
    id: 'mv_bus_a',
    tripId: T,
    kind: 'bus',
    title: 'Bus A departs',
    place: 'Via Sistina stop',
    at: '2026-12-31T07:00:00Z',
    timeZone: ROME,
    status: 'scheduled',
    pax: 20,
  },
  {
    id: 'mv_bus_b',
    tripId: T,
    kind: 'bus',
    title: 'Bus B departs',
    place: 'Via Sistina stop',
    at: '2026-12-31T07:05:00Z',
    timeZone: ROME,
    status: 'scheduled',
    pax: 18,
  },
  {
    id: 'mv_colosseum',
    tripId: T,
    kind: 'activity',
    title: 'Colosseum guided tour',
    place: 'Colosseum, main entrance',
    at: '2026-12-31T08:00:00Z',
    timeZone: ROME,
    status: 'scheduled',
    pax: 38,
  },
  {
    id: 'mv_lunch',
    tripId: T,
    kind: 'meal',
    title: 'Lunch',
    place: 'Trattoria Luciani',
    at: '2026-12-31T11:00:00Z',
    timeZone: ROME,
    status: 'scheduled',
    pax: 38,
  },
  {
    id: 'mv_forum',
    tripId: T,
    kind: 'activity',
    title: 'Roman Forum walk',
    place: 'Via Sacra',
    at: '2026-12-31T13:30:00Z',
    timeZone: ROME,
    status: 'scheduled',
    pax: 38,
  },
  {
    id: 'mv_concert',
    tripId: T,
    kind: 'activity',
    title: 'New Year concert rehearsal',
    place: 'Auditorium Parco della Musica',
    at: '2026-12-31T16:30:00Z',
    timeZone: ROME,
    status: 'delayed',
    pax: 38,
    note: 'Venue access delayed 30 min',
  },
  {
    id: 'mv_flight_late',
    tripId: T,
    kind: 'flight',
    title: 'DEMO 086 arrives (late joiners)',
    place: 'FCO Terminal 3',
    at: '2027-01-01T16:40:00Z',
    timeZone: ROME,
    status: 'delayed',
    pax: 10,
    note: 'Estimated +75 min',
  },
  {
    id: 'mv_hotel_night',
    tripId: T,
    kind: 'hotel',
    title: 'Hotel check-in',
    place: 'Hotel de la Ville',
    at: '2027-01-01T18:10:00Z',
    timeZone: ROME,
    status: 'scheduled',
    pax: 10,
  },
];

export const alerts: Alert[] = [
  {
    id: 'al_flight_delay',
    tripId: T,
    severity: 'red',
    title: 'DEMO 086 delayed 75 min',
    detail:
      '10 late joiners arrive 18:55 instead of 17:40. Transfer and dinner on Jan 1 are affected; a Journey Graph proposal is ready.',
    at: '2026-12-31T05:50:00Z',
    actions: ['Review proposal', 'Message guardians'],
  },
  {
    id: 'al_rehearsal',
    tripId: T,
    severity: 'amber',
    title: 'Rehearsal venue access delayed 30 min',
    detail:
      'Auditorium staff confirmed doors open 17:00 local. Group can stay at the Forum longer.',
    at: '2026-12-31T05:20:00Z',
    actions: ['Shift itinerary', 'Notify leaders'],
  },
  {
    id: 'al_consent',
    tripId: T,
    severity: 'info',
    title: '2 parental consent forms still missing',
    detail: 'Reminders sent yesterday. Due before the Jan 2 excursion.',
    at: '2026-12-30T18:00:00Z',
    actions: ['Open forms'],
  },
];

export const headcount: HeadcountGroup[] = [
  { label: 'Bus A', checkedIn: 18, expected: 20 },
  { label: 'Bus B', checkedIn: 16, expected: 18 },
];

export const announcements: Announcement[] = [
  {
    id: 'an_departure',
    title: 'Departure moved to 07:30',
    acknowledged: 32,
    total: 38,
    publishedAt: '2026-12-31T05:30:00Z',
  },
  {
    id: 'an_attire',
    title: 'Bring concert attire on Jan 1',
    acknowledged: 38,
    total: 38,
    publishedAt: '2026-12-30T19:00:00Z',
  },
  {
    id: 'an_rooming',
    title: 'Rooming list available',
    acknowledged: 37,
    total: 38,
    publishedAt: '2026-12-29T20:00:00Z',
  },
];

export const dashboardFixture: Dashboard = {
  organizerName: 'Nathan',
  organizationName: 'Seoul Youth Choir',
  now: FROZEN_NOW,
  lastSyncAt: '2026-12-31T06:11:30Z',
  offline: false,
  trips,
  activeTripId: T,
  movements,
  alerts,
  headcount,
  announcements,
};
