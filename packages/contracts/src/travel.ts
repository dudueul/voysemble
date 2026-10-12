// Copyright 2026- At Day. All rights reserved.
//
// Travel bookings (slice 046, D37): the flights, hotels and bus charters an organizer books for
// a trip, kept as facts to read off during the trip. No provider integration: references are
// strings the organizer types. A bus names the roster groups that ride it, so its seat count
// follows the roster. Times are wall-clock at the place (a flight departs at 13:30 in Seoul and
// lands at 18:55 in Rome); dates are calendar dates.

import { z } from '@hono/zod-openapi';
import { CalendarDate, Id, Timestamp } from './common';

export const FlightStatus = z
  .enum(['scheduled', 'delayed', 'done', 'cancelled'])
  .openapi('FlightStatus');
export type FlightStatus = z.infer<typeof FlightStatus>;

const Label = z.string().trim().min(1).max(80);
const Reference = z.string().trim().max(40);
/** YYYY-MM-DDTHH:mm, wall-clock at the place. */
const LocalDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'YYYY-MM-DDTHH:mm')
  .describe('Wall-clock at the place, YYYY-MM-DDTHH:mm.');
const Count = z.number().int().min(0).max(999);

// Field sets without defaults: the create bodies add defaults, the patch bodies must not (a
// partial schema still fills a missing key with its default, which would zero a flight's seats
// on a status change).
const FlightFields = {
  code: z.string().trim().min(1).max(40),
  from: Label,
  to: Label,
  departsAt: LocalDateTime,
  arrivesAt: LocalDateTime,
  pax: Count,
  pnr: Reference,
  status: FlightStatus,
};
const HotelFields = {
  name: Label,
  city: Label,
  checkIn: CalendarDate,
  checkOut: CalendarDate,
  rooms: Count,
  confirmation: Reference,
};
const BusFields = {
  label: Label,
  company: Label,
  seats: z.number().int().min(1).max(200),
  /** Organizer-only; never on a phone (D13 keeps even room numbers from guardians). */
  driverContact: z.string().trim().max(120),
  /** Roster group names that ride this bus; the assigned count follows the roster. */
  groups: z.array(z.string().trim().min(1).max(40)).max(50),
};

export const FlightInput = z
  .object({
    kind: z.literal('flight'),
    ...FlightFields,
    pax: Count.default(0),
    pnr: Reference.default(''),
    status: FlightStatus.default('scheduled'),
  })
  .openapi('FlightInput');
export type FlightInput = z.infer<typeof FlightInput>;

export const HotelInput = z
  .object({
    kind: z.literal('hotel'),
    ...HotelFields,
    rooms: Count.default(0),
    confirmation: Reference.default(''),
  })
  .openapi('HotelInput');
export type HotelInput = z.infer<typeof HotelInput>;

export const BusInput = z
  .object({
    kind: z.literal('bus'),
    ...BusFields,
    driverContact: BusFields.driverContact.default(''),
    groups: BusFields.groups.default([]),
  })
  .openapi('BusInput');
export type BusInput = z.infer<typeof BusInput>;

export const CreateBookingRequest = z
  .discriminatedUnion('kind', [FlightInput, HotelInput, BusInput])
  .openapi('CreateBookingRequest');
export type CreateBookingRequest = z.infer<typeof CreateBookingRequest>;

/** Any subset of the kind's fields, no defaults; the kind names which row shape is meant. */
export const UpdateBookingRequest = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('flight'), ...FlightFields })
      .partial()
      .required({ kind: true }),
    z
      .object({ kind: z.literal('hotel'), ...HotelFields })
      .partial()
      .required({ kind: true }),
    z
      .object({ kind: z.literal('bus'), ...BusFields })
      .partial()
      .required({ kind: true }),
  ])
  .openapi('UpdateBookingRequest');
export type UpdateBookingRequest = z.infer<typeof UpdateBookingRequest>;

const Stored = { id: Id, tripId: Id, createdAt: Timestamp };

export const Flight = FlightInput.extend(Stored).openapi('Flight');
export type Flight = z.infer<typeof Flight>;

export const Hotel = HotelInput.extend({ ...Stored, nights: z.number().int() }).openapi('Hotel');
export type Hotel = z.infer<typeof Hotel>;

export const BusCharter = BusInput.extend({
  ...Stored,
  /** Travelers and leaders of the roster in the bus's groups. */
  assigned: z.number().int(),
  /** Null for a leader: the driver's contact never leaves the console (D37, slice 047). */
  driverContact: z.string().nullable(),
}).openapi('BusCharter');
export type BusCharter = z.infer<typeof BusCharter>;

export const Booking = z.discriminatedUnion('kind', [Flight, Hotel, BusCharter]).openapi('Booking');
export type Booking = z.infer<typeof Booking>;

export const TravelPlan = z
  .object({
    flights: z.array(Flight),
    hotels: z.array(Hotel),
    buses: z.array(BusCharter),
    /** The roster's group names, for the bus form. */
    groups: z.array(z.string()),
    travelers: z.number().int(),
  })
  .openapi('TravelPlan');
export type TravelPlan = z.infer<typeof TravelPlan>;

/** Nights between two calendar dates; 0 when the order is wrong. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const n = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---- The driver's sealed link (D27, D39, slice 049) ----

/** A time-limited, revocable link to one bus's sheet; the token itself is shown once, only its hash is stored. */
export const DriverLink = z
  .object({
    id: Id,
    tripId: Id,
    bookingId: Id,
    createdAt: Timestamp,
    expiresAt: Timestamp,
    revokedAt: Timestamp.nullable(),
    /** Times the sheet was opened through this link. */
    opens: z.number().int(),
    lastOpenedAt: Timestamp.nullable(),
  })
  .openapi('DriverLink');
export type DriverLink = z.infer<typeof DriverLink>;

export const DriverLinkList = z.object({ links: z.array(DriverLink) }).openapi('DriverLinkList');
export type DriverLinkList = z.infer<typeof DriverLinkList>;

/** The URL carries the token in its fragment and is returned once, at creation. */
export const CreateDriverLinkResponse = z
  .object({ link: DriverLink, url: z.string() })
  .openapi('CreateDriverLinkResponse');
export type CreateDriverLinkResponse = z.infer<typeof CreateDriverLinkResponse>;

export const OpenDriverSheetRequest = z
  .object({ token: z.string().min(32).max(128) })
  .openapi('OpenDriverSheetRequest');
export type OpenDriverSheetRequest = z.infer<typeof OpenDriverSheetRequest>;

/** One roster group riding the bus: names only, leaders first. */
export const DriverSheetGroup = z
  .object({
    name: z.string(),
    leaders: z.array(z.string()),
    travelers: z.array(z.string()),
  })
  .openapi('DriverSheetGroup');
export type DriverSheetGroup = z.infer<typeof DriverSheetGroup>;

/**
 * What a driver sees: the trip, the bus and the names riding it. Never a contact, a room, a
 * care note or a guardian (D13, D27): for anything else the driver asks the leader on the bus.
 */
export const DriverSheet = z
  .object({
    organizationName: z.string(),
    tripName: z.string(),
    startsOn: CalendarDate,
    endsOn: CalendarDate,
    bus: z.object({ label: z.string(), company: z.string(), seats: z.number().int() }),
    groups: z.array(DriverSheetGroup),
    leaders: z.number().int(),
    travelers: z.number().int(),
    /** When this link stops working. */
    expiresAt: Timestamp,
  })
  .openapi('DriverSheet');
export type DriverSheet = z.infer<typeof DriverSheet>;

/* ---------- Rooming lists and the hotel's sealed link (D27, D41; slice 058) ---------- */

/** One person of the roster (leaders and travelers) and the room they are in, if any. */
export const RoomAssignment = z
  .object({
    participationId: Id,
    displayName: z.string(),
    role: z.enum(['leader', 'traveler']),
    groupName: z.string().nullable(),
    room: z.string().nullable(),
  })
  .openapi('RoomAssignment');
export type RoomAssignment = z.infer<typeof RoomAssignment>;

/** A hotel's rooming list: who sleeps where, and how much of the block is used. */
export const RoomingList = z
  .object({
    hotel: z.object({
      id: Id,
      name: z.string(),
      city: z.string(),
      checkIn: CalendarDate,
      checkOut: CalendarDate,
      rooms: z.number().int(),
    }),
    /** Leaders first, then travelers by group and name. */
    people: z.array(RoomAssignment),
    /** Distinct rooms with someone in them. */
    roomsUsed: z.number().int(),
    assigned: z.number().int(),
  })
  .openapi('RoomingList');
export type RoomingList = z.infer<typeof RoomingList>;

/** Put one person in a room (a short label: "204", "3F-12"); null takes them out. */
export const AssignRoomRequest = z
  .object({ participationId: Id, room: z.string().trim().min(1).max(20).nullable() })
  .openapi('AssignRoomRequest');
export type AssignRoomRequest = z.infer<typeof AssignRoomRequest>;

/** The hotel's link has the driver's shape: a hash kept, a URL shown once, opens counted. */
export const HotelLink = DriverLink.openapi('HotelLink');
export type HotelLink = z.infer<typeof HotelLink>;
export const HotelLinkList = z.object({ links: z.array(HotelLink) }).openapi('HotelLinkList');
export type HotelLinkList = z.infer<typeof HotelLinkList>;
export const CreateHotelLinkResponse = z
  .object({ link: HotelLink, url: z.string() })
  .openapi('CreateHotelLinkResponse');
export type CreateHotelLinkResponse = z.infer<typeof CreateHotelLinkResponse>;
export const OpenHotelSheetRequest = OpenDriverSheetRequest.openapi('OpenHotelSheetRequest');
export type OpenHotelSheetRequest = z.infer<typeof OpenHotelSheetRequest>;

export const HotelSheetRoom = z
  .object({ room: z.string(), names: z.array(z.string()) })
  .openapi('HotelSheetRoom');
export type HotelSheetRoom = z.infer<typeof HotelSheetRoom>;

/**
 * What the hotel desk sees: the stay, the rooming list by room and the leaders' names. Never a
 * contact, a guardian, a care note or a document (D13, D27).
 */
export const HotelSheet = z
  .object({
    organizationName: z.string(),
    tripName: z.string(),
    hotel: z.object({
      name: z.string(),
      city: z.string(),
      checkIn: CalendarDate,
      checkOut: CalendarDate,
      nights: z.number().int(),
      rooms: z.number().int(),
      confirmation: z.string(),
    }),
    /** Sorted by room label. */
    rooms: z.array(HotelSheetRoom),
    /** People on the roster without a room yet, by name. */
    unassigned: z.array(z.string()),
    leaders: z.array(z.string()),
    people: z.number().int(),
    expiresAt: Timestamp,
  })
  .openapi('HotelSheet');
export type HotelSheet = z.infer<typeof HotelSheet>;
