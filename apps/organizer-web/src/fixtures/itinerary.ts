// Copyright 2026- At Day. All rights reserved.
//
// Synthetic itinerary for the Korea Concert Tour fixture: 13 days, Dec 28 2026 to Jan 9 2027.
// Day 1 is in Asia/Seoul (departure), the rest in Europe/Rome. Times are local wall-clock strings
// with an explicit zone; the server owns instants (doc 01 §13.5). No real venue is implied.

export type EventKind = 'flight' | 'bus' | 'meal' | 'activity' | 'hotel' | 'meeting' | 'free';
export type EventStatus = 'scheduled' | 'in_progress' | 'done' | 'delayed' | 'cancelled';

export interface ItineraryEvent {
  id: string;
  tripId: string;
  /** Local calendar date, YYYY-MM-DD, in `timeZone`. */
  date: string;
  /** Local start HH:mm. */
  start: string;
  /** Local end HH:mm, optional. */
  end?: string;
  timeZone: string;
  kind: EventKind;
  title: string;
  place: string;
  /** Participants: a count, or 'all' for the whole group. */
  pax: number | 'all';
  status: EventStatus;
  note?: string;
  /** Order within the day; the editor reorders by this, not by time. */
  order: number;
  /** False while a change has not been published. */
  published: boolean;
}

export interface ItineraryDay {
  date: string;
  timeZone: string;
  label: string;
}

export interface Itinerary {
  tripId: string;
  tripName: string;
  startDate: string;
  endDate: string;
  revision: number;
  days: ItineraryDay[];
  events: ItineraryEvent[];
}

const T = 'trip_korea_concert_tour';
const SEOUL = 'Asia/Seoul';
const ROME = 'Europe/Rome';

type Row = [
  start: string,
  end: string | null,
  kind: EventKind,
  title: string,
  place: string,
  pax?: number | 'all',
  status?: EventStatus,
  note?: string,
];

function day(
  date: string,
  timeZone: string,
  label: string,
  rows: Row[],
): { day: ItineraryDay; events: ItineraryEvent[] } {
  return {
    day: { date, timeZone, label },
    events: rows.map(
      ([start, end, kind, title, place, pax = 'all', status = 'scheduled', note], i) => ({
        id: `ev_${date}_${i + 1}`,
        tripId: T,
        date,
        start,
        ...(end ? { end } : {}),
        timeZone,
        kind,
        title,
        place,
        pax,
        status,
        ...(note ? { note } : {}),
        order: i + 1,
        published: true,
      }),
    ),
  };
}

const DAYS = [
  day('2026-12-28', SEOUL, 'Departure', [
    ['06:30', '07:30', 'meeting', 'Group check-in', 'ICN Terminal 2, counter K', 'all', 'done'],
    [
      '09:40',
      null,
      'flight',
      'DEMO 901 ICN → FCO',
      'ICN Terminal 2, gate 231',
      28,
      'done',
      'Second group on DEMO 086 on Jan 1',
    ],
    ['14:10', null, 'flight', 'DEMO 901 arrives', 'FCO Terminal 3', 28, 'done'],
    [
      '16:00',
      '17:00',
      'bus',
      'Transfer to hotel',
      'FCO coach park → Hotel de la Ville',
      28,
      'done',
    ],
    ['19:00', '20:30', 'meal', 'Welcome dinner', 'Hotel de la Ville, restaurant', 28, 'done'],
  ]),
  day('2026-12-29', ROME, 'Vatican', [
    ['07:30', '08:30', 'meal', 'Breakfast', 'Hotel de la Ville, restaurant', 'all', 'done'],
    [
      '09:00',
      '12:30',
      'activity',
      'Vatican Museums guided tour',
      'Viale Vaticano entrance',
      'all',
      'done',
    ],
    ['13:00', '14:00', 'meal', 'Lunch', 'Borgo Pio', 'all', 'done'],
    ['15:00', '17:00', 'activity', 'Rehearsal', 'Hotel de la Ville, salon', 'all', 'done'],
    ['19:30', '21:00', 'meal', 'Dinner', 'Trattoria Luciani', 'all', 'done'],
  ]),
  day('2026-12-30', ROME, 'Old town', [
    ['07:30', '08:30', 'meal', 'Breakfast', 'Hotel de la Ville, restaurant', 'all', 'done'],
    [
      '09:00',
      '11:30',
      'activity',
      'Pantheon and Piazza Navona walk',
      'Piazza della Rotonda',
      'all',
      'done',
    ],
    ['12:00', '13:30', 'meal', 'Lunch', 'Campo de Fiori', 'all', 'done'],
    [
      '14:30',
      '17:30',
      'free',
      'Free time in small groups',
      'Centro storico',
      'all',
      'done',
      'Leaders carry radios; meeting point Piazza di Spagna 17:30',
    ],
    ['19:00', '20:30', 'meal', 'Dinner', 'Hotel de la Ville, restaurant', 'all', 'done'],
  ]),
  day('2026-12-31', ROME, 'Colosseum', [
    ['07:30', '08:15', 'meal', 'Breakfast', 'Hotel de la Ville, restaurant', 'all', 'in_progress'],
    [
      '07:30',
      null,
      'meeting',
      'Meet in the hotel lobby',
      'Hotel de la Ville, lobby',
      'all',
      'scheduled',
      'Moved from 07:00 by the tour leader',
    ],
    ['08:00', '08:45', 'bus', 'Bus A and Bus B depart', 'Via Sistina stop', 'all'],
    ['09:00', '11:00', 'activity', 'Colosseum guided tour', 'Colosseum, main entrance', 'all'],
    ['12:00', '13:30', 'meal', 'Lunch', 'Trattoria Luciani', 'all'],
    ['14:30', '16:00', 'activity', 'Roman Forum walk', 'Via Sacra', 'all'],
    [
      '17:30',
      '19:00',
      'activity',
      'New Year concert rehearsal',
      'Auditorium Parco della Musica',
      'all',
      'delayed',
      'Venue access delayed 30 min',
    ],
    ['20:00', '22:00', 'meal', 'New Year dinner', 'Hotel de la Ville, restaurant', 'all'],
  ]),
  day('2027-01-01', ROME, 'Concert', [
    ['09:00', '10:00', 'meal', 'Late breakfast', 'Hotel de la Ville, restaurant', 'all'],
    ['11:00', '12:30', 'activity', 'Sound check', 'Auditorium Parco della Musica', 'all'],
    [
      '17:40',
      null,
      'flight',
      'DEMO 086 arrives (late joiners)',
      'FCO Terminal 3',
      10,
      'delayed',
      'Estimated +75 min',
    ],
    [
      '18:20',
      '19:10',
      'bus',
      'Transfer late joiners to hotel',
      'FCO coach park → Hotel de la Ville',
      10,
    ],
    [
      '20:00',
      '21:30',
      'meal',
      'Group dinner',
      'Ristorante Il Giardino',
      'all',
      'scheduled',
      'Latest arrival 20:30; conflict if transfer slips',
    ],
  ]),
  day('2027-01-02', ROME, 'Concert day', [
    ['07:30', '08:30', 'meal', 'Breakfast', 'Hotel de la Ville, restaurant', 'all'],
    ['10:00', '12:00', 'activity', 'Dress rehearsal', 'Auditorium Parco della Musica', 'all'],
    ['12:30', '13:30', 'meal', 'Lunch', 'Auditorium café', 'all'],
    [
      '18:30',
      '20:30',
      'activity',
      'New Year concert',
      'Auditorium Parco della Musica, Sala Sinopoli',
      'all',
    ],
    ['21:00', '22:30', 'meal', 'Celebration dinner', 'Hotel de la Ville, restaurant', 'all'],
  ]),
  day('2027-01-03', ROME, 'Tivoli', [
    ['07:30', '08:30', 'meal', 'Breakfast', 'Hotel de la Ville, restaurant', 'all'],
    ['09:00', '10:00', 'bus', 'Bus to Tivoli', 'Via Sistina stop', 'all'],
    ['10:15', '12:30', 'activity', "Villa d'Este gardens", 'Tivoli', 'all'],
    ['13:00', '14:00', 'meal', 'Lunch', 'Tivoli old town', 'all'],
    ['16:00', '17:00', 'bus', 'Return to Rome', 'Tivoli coach park', 'all'],
  ]),
  day('2027-01-04', ROME, 'Florence', [
    ['06:30', '07:15', 'meal', 'Early breakfast', 'Hotel de la Ville, restaurant', 'all'],
    [
      '08:05',
      '09:40',
      'activity',
      'High-speed train to Florence',
      'Roma Termini, platform 7',
      'all',
    ],
    ['10:30', '12:30', 'activity', 'Duomo and Baptistery', 'Piazza del Duomo', 'all'],
    ['13:00', '14:00', 'meal', 'Lunch', 'Mercato Centrale', 'all'],
    ['15:00', '17:00', 'activity', 'Uffizi', 'Piazzale degli Uffizi', 'all'],
    ['19:00', '20:30', 'meal', 'Dinner', 'Hotel Firenze Centro', 'all'],
  ]),
  day('2027-01-05', ROME, 'Florence', [
    ['07:30', '08:30', 'meal', 'Breakfast', 'Hotel Firenze Centro', 'all'],
    ['09:30', '11:30', 'activity', 'Choir exchange workshop', 'Scuola di Musica di Fiesole', 'all'],
    ['12:00', '13:30', 'meal', 'Lunch with host choir', 'Fiesole', 'all'],
    ['15:00', '17:00', 'free', 'Free time', 'Centro', 'all'],
    ['19:00', '20:30', 'meal', 'Dinner', 'Hotel Firenze Centro', 'all'],
  ]),
  day('2027-01-06', ROME, 'Siena', [
    ['07:30', '08:30', 'meal', 'Breakfast', 'Hotel Firenze Centro', 'all'],
    ['09:00', '10:30', 'bus', 'Bus to Siena', 'Hotel Firenze Centro', 'all'],
    ['11:00', '13:00', 'activity', 'Piazza del Campo and cathedral', 'Siena', 'all'],
    ['13:00', '14:00', 'meal', 'Lunch', 'Siena', 'all'],
    ['15:00', '17:30', 'bus', 'Bus back to Rome', 'Siena coach park', 'all'],
    ['19:30', '21:00', 'meal', 'Dinner', 'Hotel de la Ville, restaurant', 'all'],
  ]),
  day('2027-01-07', ROME, 'Ostia', [
    ['07:30', '08:30', 'meal', 'Breakfast', 'Hotel de la Ville, restaurant', 'all'],
    ['09:30', '12:00', 'activity', 'Ostia Antica', 'Ostia Antica archaeological park', 'all'],
    ['12:30', '13:30', 'meal', 'Lunch', 'Ostia', 'all'],
    ['15:00', '17:00', 'activity', 'Farewell rehearsal', 'Hotel de la Ville, salon', 'all'],
    ['19:00', '21:00', 'meal', 'Farewell dinner', 'Ristorante Il Giardino', 'all'],
  ]),
  day('2027-01-08', ROME, 'Packing day', [
    ['08:00', '09:00', 'meal', 'Breakfast', 'Hotel de la Ville, restaurant', 'all'],
    ['10:00', '12:00', 'free', 'Souvenirs in small groups', 'Via del Corso', 'all'],
    [
      '14:00',
      '16:00',
      'activity',
      'Bag check and document check',
      'Hotel de la Ville, salon',
      'all',
    ],
    ['19:00', '20:30', 'meal', 'Dinner', 'Hotel de la Ville, restaurant', 'all'],
  ]),
  day('2027-01-09', ROME, 'Return', [
    ['05:30', '06:00', 'meal', 'Breakfast boxes', 'Hotel de la Ville, lobby', 'all'],
    ['06:15', '07:15', 'bus', 'Transfer to FCO', 'Hotel de la Ville → FCO Terminal 3', 'all'],
    ['10:25', null, 'flight', 'DEMO 902 FCO → ICN', 'FCO Terminal 3', 'all'],
  ]),
];

export const itineraryFixture: Itinerary = {
  tripId: T,
  tripName: 'Korea Concert Tour',
  startDate: '2026-12-28',
  endDate: '2027-01-09',
  revision: 7,
  days: DAYS.map((d) => d.day),
  events: DAYS.flatMap((d) => d.events),
};
