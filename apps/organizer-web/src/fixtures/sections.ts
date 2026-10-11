// Copyright 2026- At Day. All rights reserved.
//
// Synthetic fixtures for the ten section pages (slice 008). Same trip as korea-concert-tour.ts:
// Korea Concert Tour, 38 travelers, two buses, frozen at Day 4 (2026-12-31 07:12 Rome).
// Every page that reads this module shows the "Sample data" chip; feature-status.json records
// each as `simulated`. No real person, venue, or institution. Behaviour follows ADR-0009.

import { FROZEN_NOW } from './korea-concert-tour';

export { FROZEN_NOW };

/* ---------- People & groups (D12, D21) ---------- */

export type PersonRole = 'traveler' | 'guardian' | 'leader';
export type JoinStatus = 'joined' | 'invited' | 'pending';

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  group: 'Bus A' | 'Bus B' | null;
  status: JoinStatus;
  /** Traveler this guardian is bound to. */
  guardianOf?: string;
  /** Care note present (D27). The note itself is never in a fixture. */
  hasCareNote: boolean;
  lastAckAt?: string;
}

const T: Person[] = [
  ['Minji Park', 'Bus A', 'joined', true, '2026-12-31T05:50:00Z'],
  ['Juho Kim', 'Bus A', 'joined', false, '2026-12-31T05:52:00Z'],
  ['Hana Lee', 'Bus B', 'joined', false, '2026-12-30T21:10:00Z'],
  ['Seojun Choi', 'Bus A', 'invited', false],
  ['Yuna Jung', 'Bus B', 'joined', true, '2026-12-31T05:58:00Z'],
  ['Dohyun Kang', 'Bus B', 'joined', false, '2026-12-31T06:01:00Z'],
  ['Jiwoo Han', 'Bus A', 'pending', false],
  ['Taeyang Oh', 'Bus B', 'joined', false, '2026-12-30T20:40:00Z'],
  ['Eunwoo Shin', 'Bus A', 'joined', false, '2026-12-31T06:03:00Z'],
  ['Sua Lim', 'Bus B', 'joined', true, '2026-12-31T05:49:00Z'],
  ['Hyunwoo Nam', 'Bus A', 'joined', false, '2026-12-31T05:55:00Z'],
  ['Chaewon Yoo', 'Bus B', 'invited', false],
].map(([name, group, status, hasCareNote, lastAckAt], i) => ({
  id: `t${i + 1}`,
  name: name as string,
  role: 'traveler' as const,
  group: group as 'Bus A' | 'Bus B',
  status: status as JoinStatus,
  hasCareNote: hasCareNote as boolean,
  ...(lastAckAt ? { lastAckAt: lastAckAt as string } : {}),
}));

const G: Person[] = [
  ['Sora Park', 't1', 'joined'],
  ['Minsu Kim', 't2', 'joined'],
  ['Jieun Lee', 't3', 'invited'],
  ['Hyeri Jung', 't5', 'joined'],
  ['Woojin Lim', 't10', 'pending'],
].map(([name, guardianOf, status], i) => ({
  id: `g${i + 1}`,
  name: name as string,
  role: 'guardian' as const,
  group: T.find((t) => t.id === guardianOf)?.group ?? null,
  status: status as JoinStatus,
  guardianOf: guardianOf as string,
  hasCareNote: false,
}));

const L: Person[] = [
  {
    id: 'l1',
    name: 'Kim Daeun',
    role: 'leader',
    group: 'Bus A',
    status: 'joined',
    hasCareNote: false,
  },
  {
    id: 'l2',
    name: 'Park Jisoo',
    role: 'leader',
    group: 'Bus B',
    status: 'joined',
    hasCareNote: false,
  },
];

export const people: Person[] = [...L, ...T, ...G];

/** Totals the People page reports for the whole trip, beyond the rows shown. */
export const peopleTotals = { travelers: 38, guardians: 29, leaders: 4, joined: 61 };

/* ---------- Communication (D16, D22) ---------- */

export interface Channel {
  id: string;
  name: string;
  kind: 'trip-all' | 'group' | 'traveler-leader' | 'guardian-organizer';
  unread: number;
  lastAt: string;
  lastPreview: string;
}

export const channels: Channel[] = [
  {
    id: 'c1',
    name: 'Trip: everyone',
    kind: 'trip-all',
    unread: 0,
    lastAt: '2026-12-31T05:40:00Z',
    lastPreview: 'Breakfast moved to 06:30, lobby. Bus leaves 07:15.',
  },
  {
    id: 'c2',
    name: 'Bus A',
    kind: 'group',
    unread: 3,
    lastAt: '2026-12-31T06:05:00Z',
    lastPreview: 'Kim Daeun: Seats 1-4 for the choir section today.',
  },
  {
    id: 'c3',
    name: 'Bus B',
    kind: 'group',
    unread: 0,
    lastAt: '2026-12-31T05:58:00Z',
    lastPreview: 'Park Jisoo: Water bottles at the back.',
  },
  {
    id: 'c4',
    name: 'Juho Kim ↔ Kim Daeun',
    kind: 'traveler-leader',
    unread: 1,
    lastAt: '2026-12-30T21:10:00Z',
    lastPreview: 'stomach hurts a bit, ok now',
  },
  {
    id: 'c5',
    name: 'Sora Park ↔ Organizer',
    kind: 'guardian-organizer',
    unread: 2,
    lastAt: '2026-12-31T04:12:00Z',
    lastPreview: 'Could you confirm Minji is on the bus?',
  },
];

export interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  requiresAck: boolean;
  sharedWithGuardians: boolean;
  acknowledged: number;
  total: number;
  translated: boolean;
  unacked: string[];
}

export const announcements: AnnouncementDetail[] = [
  {
    id: 'a1',
    title: 'Breakfast moved to 06:30',
    body: 'Breakfast moved to 06:30, lobby. Bus leaves 07:15.',
    publishedAt: '2026-12-30T20:30:00Z',
    requiresAck: true,
    sharedWithGuardians: true,
    acknowledged: 36,
    total: 38,
    translated: true,
    unacked: ['Seojun Choi', 'Jiwoo Han'],
  },
  {
    id: 'a2',
    title: 'Colosseum: meeting point is the blue flag',
    body: 'We meet at 08:30 outside the Colosseum main entrance. Look for the blue flag.',
    publishedAt: '2026-12-30T18:00:00Z',
    requiresAck: true,
    sharedWithGuardians: false,
    acknowledged: 38,
    total: 38,
    translated: true,
    unacked: [],
  },
  {
    id: 'a3',
    title: 'Photo album of Day 3 is up',
    body: '24 photos approved by leaders are in the guardian album.',
    publishedAt: '2026-12-30T17:10:00Z',
    requiresAck: false,
    sharedWithGuardians: true,
    acknowledged: 0,
    total: 38,
    translated: false,
    unacked: [],
  },
];

/* ---------- Safety: meeting window, head count, incidents (D14, D15, D17, D25) ---------- */

export type WindowState = 'inside' | 'outside' | 'uncertain' | 'stale' | 'opted_out';

export interface MeetingWindow {
  id: string;
  label: string;
  place: string;
  startsAt: string;
  endsAt: string;
  radiusMeters: number;
  groups: string[];
  openedBy: string;
  /** Participants in the window, with relative position inside a unit disc (for the sample map). */
  members: { id: string; name: string; state: WindowState; dx: number; dy: number }[];
}

export const meetingWindow: MeetingWindow = {
  id: 'w1',
  label: 'Colosseum regroup',
  place: 'Colosseum, main entrance',
  startsAt: '2026-12-31T09:45:00Z',
  endsAt: '2026-12-31T10:20:00Z',
  radiusMeters: 200,
  groups: ['Bus A', 'Bus B'],
  openedBy: 'Kim Daeun',
  members: [
    { id: 't1', name: 'Minji Park', state: 'inside', dx: -0.3, dy: 0.2 },
    { id: 't2', name: 'Juho Kim', state: 'inside', dx: 0.2, dy: -0.4 },
    { id: 't3', name: 'Hana Lee', state: 'inside', dx: 0.5, dy: 0.3 },
    { id: 't5', name: 'Yuna Jung', state: 'inside', dx: -0.6, dy: -0.1 },
    { id: 't6', name: 'Dohyun Kang', state: 'outside', dx: 1.3, dy: 0.6 },
    { id: 't8', name: 'Taeyang Oh', state: 'inside', dx: 0.1, dy: 0.7 },
    { id: 't9', name: 'Eunwoo Shin', state: 'stale', dx: -0.9, dy: 0.9 },
    { id: 't10', name: 'Sua Lim', state: 'inside', dx: 0.4, dy: -0.1 },
    { id: 't11', name: 'Hyunwoo Nam', state: 'uncertain', dx: 0.9, dy: -0.8 },
    { id: 't4', name: 'Seojun Choi', state: 'opted_out', dx: 0, dy: 0 },
  ],
};

export interface Incident {
  id: string;
  title: string;
  person: string;
  openedAt: string;
  status: 'open' | 'confirmed' | 'closed';
  confirmedBy?: string;
  confirmedAt?: string;
  guardianNotified: boolean;
}

export const incidents: Incident[] = [
  {
    id: 'i1',
    title: 'Phone lost, not reachable',
    person: 'Minji Park',
    openedAt: '2026-12-30T13:30:00Z',
    status: 'confirmed',
    confirmedBy: 'Kim Daeun',
    confirmedAt: '2026-12-30T13:42:00Z',
    guardianNotified: true,
  },
  {
    id: 'i2',
    title: 'Head count closed with 2 missing (Bus B, 06:50)',
    person: 'Dohyun Kang, Eunwoo Shin',
    openedAt: '2026-12-31T05:52:00Z',
    status: 'open',
    guardianNotified: false,
  },
];

export const headcountMissing = [
  {
    name: 'Dohyun Kang',
    room: '412',
    lastAck: '2026-12-31T06:01:00Z',
    windowState: 'outside' as WindowState,
  },
  {
    name: 'Eunwoo Shin',
    room: '408',
    lastAck: '2026-12-31T06:03:00Z',
    windowState: 'stale' as WindowState,
  },
];

/* ---------- Journey graph (doc 03 engineering graph; itinerary dependencies) ---------- */

export type NodeKind = 'flight' | 'bus' | 'meal' | 'activity' | 'hotel' | 'meeting';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  title: string;
  day: number;
  time: string;
  status: 'done' | 'now' | 'next' | 'risk';
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Minutes of slack between the end of `from` and the start of `to`. */
  slackMin: number;
}

export const graphNodes: GraphNode[] = [
  { id: 'n1', kind: 'hotel', title: 'Hotel de la Ville', day: 4, time: '06:30', status: 'done' },
  { id: 'n2', kind: 'meal', title: 'Breakfast', day: 4, time: '06:30', status: 'done' },
  { id: 'n3', kind: 'meeting', title: 'Lobby regroup', day: 4, time: '07:05', status: 'now' },
  { id: 'n4', kind: 'bus', title: 'Bus to Colosseum', day: 4, time: '07:15', status: 'next' },
  { id: 'n5', kind: 'activity', title: 'Colosseum tour', day: 4, time: '09:00', status: 'next' },
  { id: 'n6', kind: 'meeting', title: 'Regroup (window)', day: 4, time: '10:45', status: 'risk' },
  { id: 'n7', kind: 'meal', title: 'Lunch, Trastevere', day: 4, time: '12:30', status: 'next' },
  { id: 'n8', kind: 'bus', title: 'Bus to rehearsal hall', day: 4, time: '14:00', status: 'next' },
  { id: 'n9', kind: 'activity', title: 'Rehearsal', day: 4, time: '15:00', status: 'next' },
  { id: 'n10', kind: 'hotel', title: 'Hotel de la Ville', day: 4, time: '19:30', status: 'next' },
  {
    id: 'n11',
    kind: 'flight',
    title: 'FCO → ICN (DEMO 902)',
    day: 13,
    time: '11:40',
    status: 'next',
  },
];

export const graphEdges: GraphEdge[] = [
  { from: 'n1', to: 'n2', slackMin: 0 },
  { from: 'n2', to: 'n3', slackMin: 5 },
  { from: 'n3', to: 'n4', slackMin: 10 },
  { from: 'n4', to: 'n5', slackMin: 45 },
  { from: 'n5', to: 'n6', slackMin: 15 },
  { from: 'n6', to: 'n7', slackMin: 25 },
  { from: 'n7', to: 'n8', slackMin: 30 },
  { from: 'n8', to: 'n9', slackMin: 20 },
  { from: 'n9', to: 'n10', slackMin: 90 },
];

/* ---------- Travel: flights, hotels, buses ---------- */

export interface Flight {
  id: string;
  code: string;
  from: string;
  to: string;
  departs: string;
  arrives: string;
  pax: number;
  status: 'scheduled' | 'done' | 'delayed';
  pnr: string;
}

export const flights: Flight[] = [
  {
    id: 'f1',
    code: 'DEMO 901',
    from: 'ICN',
    to: 'FCO',
    departs: '2026-12-28T13:30:00+09:00',
    arrives: '2026-12-28T18:55:00+01:00',
    pax: 42,
    status: 'done',
    pnr: 'VYS8K2',
  },
  {
    id: 'f2',
    code: 'DEMO 902',
    from: 'FCO',
    to: 'ICN',
    departs: '2027-01-09T11:40:00+01:00',
    arrives: '2027-01-10T07:20:00+09:00',
    pax: 42,
    status: 'scheduled',
    pnr: 'VYS8K2',
  },
];

export interface Hotel {
  id: string;
  name: string;
  city: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  nights: number;
  confirmation: string;
}

export const hotels: Hotel[] = [
  {
    id: 'h1',
    name: 'Hotel de la Ville',
    city: 'Rome',
    checkIn: '2026-12-28',
    checkOut: '2027-01-02',
    rooms: 21,
    nights: 5,
    confirmation: 'HDV-20261228',
  },
  {
    id: 'h2',
    name: 'Albergo Fiorentino',
    city: 'Florence',
    checkIn: '2027-01-02',
    checkOut: '2027-01-05',
    rooms: 21,
    nights: 3,
    confirmation: 'AFI-44871',
  },
  {
    id: 'h3',
    name: 'Casa Laguna',
    city: 'Venice',
    checkIn: '2027-01-05',
    checkOut: '2027-01-09',
    rooms: 21,
    nights: 4,
    confirmation: 'CL-99120',
  },
];

export interface BusCharter {
  id: string;
  label: string;
  company: string;
  seats: number;
  assigned: number;
  driverContact: string;
}

export const buses: BusCharter[] = [
  {
    id: 'b1',
    label: 'Bus A',
    company: 'Roma Coach (sample)',
    seats: 24,
    assigned: 20,
    driverContact: 'via organizer',
  },
  {
    id: 'b2',
    label: 'Bus B',
    company: 'Roma Coach (sample)',
    seats: 24,
    assigned: 18,
    driverContact: 'via organizer',
  },
];

/* ---------- Media (D18) ---------- */

export interface MediaItem {
  id: string;
  uploader: string;
  day: number;
  hue: number;
  state: 'pool' | 'flagged' | 'approved' | 'hidden';
  flag?: 'nudity' | 'non_member_minor' | undefined;
  tagged: string[];
}

export const media: MediaItem[] = Array.from({ length: 18 }, (_, i) => {
  const states: MediaItem['state'][] = ['approved', 'pool', 'pool', 'approved', 'pool', 'flagged'];
  const state = states[i % states.length] ?? 'pool';
  return {
    id: `m${i + 1}`,
    uploader: ['Juho Kim', 'Minji Park', 'Kim Daeun', 'Sua Lim'][i % 4] ?? 'Juho Kim',
    day: 3 + Math.floor(i / 9),
    hue: (i * 47) % 360,
    state,
    ...(state === 'flagged'
      ? { flag: (i % 2 ? 'non_member_minor' : 'nudity') as MediaItem['flag'] }
      : {}),
    tagged: i % 3 === 0 ? ['Minji Park'] : i % 3 === 1 ? ['whole group'] : [],
  };
});

/* ---------- Preparation: documents and forms (D27) ---------- */

export interface DocumentRequirement {
  id: string;
  name: string;
  required: boolean;
  collected: number;
  total: number;
  dueOn: string;
}

export const documents: DocumentRequirement[] = [
  {
    id: 'd1',
    name: 'Passport copy',
    required: true,
    collected: 38,
    total: 38,
    dueOn: '2026-12-10',
  },
  {
    id: 'd2',
    name: 'Travel insurance',
    required: true,
    collected: 36,
    total: 38,
    dueOn: '2026-12-15',
  },
  {
    id: 'd3',
    name: 'Parental consent',
    required: true,
    collected: 38,
    total: 38,
    dueOn: '2026-12-10',
  },
  {
    id: 'd4',
    name: 'Medical information',
    required: true,
    collected: 35,
    total: 38,
    dueOn: '2026-12-15',
  },
  {
    id: 'd5',
    name: 'Packing checklist',
    required: false,
    collected: 22,
    total: 38,
    dueOn: '2026-12-26',
  },
];

export const packingChecklist = [
  { item: 'Passport + copy', done: true },
  { item: 'Concert attire (black)', done: true },
  { item: 'Sheet music folder', done: true },
  { item: 'EU plug adapter', done: false },
  { item: 'Medication with doctor note', done: false },
];

/* ---------- Reports (D16, D14) ---------- */

export interface DayMetric {
  day: number;
  date: string;
  ackRate: number;
  headcountCloseMin: number;
  announcements: number;
}

export const dayMetrics: DayMetric[] = [
  { day: 1, date: '2026-12-28', ackRate: 71, headcountCloseMin: 14, announcements: 4 },
  { day: 2, date: '2026-12-29', ackRate: 84, headcountCloseMin: 9, announcements: 3 },
  { day: 3, date: '2026-12-30', ackRate: 92, headcountCloseMin: 7, announcements: 5 },
  { day: 4, date: '2026-12-31', ackRate: 95, headcountCloseMin: 6, announcements: 2 },
];

/* ---------- Billing (D23) ---------- */

export interface LedgerRow {
  id: string;
  name: string;
  group: string;
  amountKrw: number;
  paidKrw: number;
  status: 'paid' | 'partial' | 'unpaid' | 'refunded' | 'waived';
  dueOn: string;
}

export const ledger: LedgerRow[] = [
  {
    id: 'r1',
    name: 'Minji Park',
    group: 'Bus A',
    amountKrw: 2_400_000,
    paidKrw: 2_400_000,
    status: 'paid',
    dueOn: '2026-11-30',
  },
  {
    id: 'r2',
    name: 'Juho Kim',
    group: 'Bus A',
    amountKrw: 2_400_000,
    paidKrw: 2_400_000,
    status: 'paid',
    dueOn: '2026-11-30',
  },
  {
    id: 'r3',
    name: 'Hana Lee',
    group: 'Bus B',
    amountKrw: 2_400_000,
    paidKrw: 1_200_000,
    status: 'partial',
    dueOn: '2026-11-30',
  },
  {
    id: 'r4',
    name: 'Seojun Choi',
    group: 'Bus A',
    amountKrw: 2_400_000,
    paidKrw: 0,
    status: 'unpaid',
    dueOn: '2026-11-30',
  },
  {
    id: 'r5',
    name: 'Yuna Jung',
    group: 'Bus B',
    amountKrw: 2_400_000,
    paidKrw: 2_400_000,
    status: 'paid',
    dueOn: '2026-11-30',
  },
  {
    id: 'r6',
    name: 'Chaewon Yoo',
    group: 'Bus B',
    amountKrw: 2_400_000,
    paidKrw: 2_400_000,
    status: 'refunded',
    dueOn: '2026-11-30',
  },
];

export const ledgerTotals = {
  travelers: 38,
  paid: 33,
  partial: 2,
  unpaid: 2,
  refunded: 1,
  collectedKrw: 82_800_000,
  expectedKrw: 88_800_000,
};

export const plan = {
  name: 'Per-trip plan',
  seats: 38,
  priceKrw: 190_000,
  renewsOn: '2027-01-09',
  status: 'active' as const,
};

/* ---------- Settings (D20, D29, D11) ---------- */

export const orgSettings = {
  name: 'Seoul Arts High School (sample)',
  defaultLocale: 'ko' as const,
  timezone: 'Asia/Seoul',
  quietHours: { from: '23:00', to: '06:30' },
  wrapUpDays: 90,
  guardianDigestHour: '19:00',
  members: [
    { name: 'Nathan (you)', role: 'owner', email: 'nathan@example.com' },
    { name: 'Kim Daeun', role: 'leader', email: 'daeun@example.com' },
    { name: 'Park Jisoo', role: 'leader', email: 'jisoo@example.com' },
  ],
};
