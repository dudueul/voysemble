// Copyright 2026- At Day. All rights reserved.
// Travel: flights, hotels, bus charters (gallery #8 cards). Live (slice 046, D37) once the
// organization has a trip: the plan from `GET .../travel`, one add form per card, a flight's
// status as a select, a bus's riding groups as checkboxes over the roster's groups (its assigned
// seats follow the roster), and a remove button per row. Booking references are strings the
// organizer typed; no provider integration exists. A bus also carries its driver links (D39,
// slice 049): minted here, shown once, listed with their opens, revoked. The fixture otherwise.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BusCharter,
  CreateBookingRequest,
  Flight,
  FlightStatus,
  Hotel,
  Organization,
  RoomAssignment,
  Trip,
} from '@voysemble/contracts';
import { type FormEvent, useState } from 'react';
import { Icons } from '../../app/shell/icons';
import { buses, flights, hotels } from '../../fixtures/sections';
import { errorText } from '../../lib/errors';
import {
  driverLinksQuery,
  hotelLinksQuery,
  orgsQuery,
  pickActiveOrg,
  roomingQuery,
  travel as travelApi,
  travelQuery,
  tripsQuery,
} from '../../lib/session';
import { strings } from '../../lib/strings';
import { Card, Meter, SectionPage } from './SectionPage';

const s = strings.travel;

function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

const FLIGHT_STATUSES: FlightStatus[] = ['scheduled', 'delayed', 'done', 'cancelled'];
/** Chip tone per status; the stylesheet has no cancelled tone, the expired one reads the same. */
const chipOf = (status: FlightStatus) =>
  `chip chip--${status === 'cancelled' ? 'expired' : status}`;

export function TravelPage() {
  const orgs = useQuery(orgsQuery);
  const org = orgs.data ? pickActiveOrg(orgs.data) : null;
  const trips = useQuery({ ...tripsQuery(org?.id ?? ''), enabled: Boolean(org) });
  const trip = trips.data?.[0] ?? null;
  if (org && trip) return <LiveTravel org={org} trip={trip} />;
  return <FixtureTravel />;
}

const int = (v: string, fallback: number) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

function LiveTravel({ org, trip }: { org: Organization; trip: Trip }) {
  const qc = useQueryClient();
  const plan = useQuery(travelQuery(org.id, trip.id));
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: travelQuery(org.id, trip.id).queryKey });
  const create = useMutation({
    mutationFn: (body: CreateBookingRequest) => travelApi.create(org.id, trip.id, body),
    onSuccess: () => {
      setNote(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.addFailed)),
  });
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setNote(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.actionFailed)),
  });
  const remove = (id: string) => act.mutate(() => travelApi.remove(org.id, trip.id, id));
  const data = plan.data;
  const status = (
    <span className="field__hint" role="status" data-testid="travel-status">
      {note ?? ''}
    </span>
  );
  return (
    <SectionPage
      title={strings.nav.travel}
      subtitle={
        data
          ? s.liveSubtitle(
              data.flights.length,
              data.hotels.length,
              data.buses.length,
              data.travelers,
            )
          : ''
      }
      sample={false}
      actions={<span className="chip chip--active">{strings.dashboard.live}</span>}
    >
      {plan.isPending ? (
        <p className="muted small" role="status">
          {strings.settings.loading}
        </p>
      ) : plan.isError ? (
        <p className="muted small" role="status">
          {errorText(plan.error, s.loadFailed)}
        </p>
      ) : data ? (
        <>
          <Card title={s.flights} id="travel-flights">
            {data.flights.length === 0 ? (
              <p className="muted small">{s.noFlights}</p>
            ) : (
              <ul className="list" data-testid="flight-list">
                {data.flights.map((f) => (
                  <FlightRow
                    key={f.id}
                    flight={f}
                    busy={act.isPending}
                    onStatus={(st) =>
                      act.mutate(() =>
                        travelApi.update(org.id, trip.id, f.id, { kind: 'flight', status: st }),
                      )
                    }
                    onRemove={() => remove(f.id)}
                  />
                ))}
              </ul>
            )}
            <FlightForm
              busy={create.isPending}
              onSubmit={(b) => create.mutate(b)}
              status={status}
            />
          </Card>
          <div className="grid">
            <Card title={s.hotels} id="travel-hotels">
              {data.hotels.length === 0 ? (
                <p className="muted small">{s.noHotels}</p>
              ) : (
                <ul className="list" data-testid="hotel-list">
                  {data.hotels.map((h) => (
                    <HotelRow
                      key={h.id}
                      org={org}
                      trip={trip}
                      hotel={h}
                      busy={act.isPending}
                      onRemove={() => remove(h.id)}
                    />
                  ))}
                </ul>
              )}
              <HotelForm busy={create.isPending} onSubmit={(b) => create.mutate(b)} />
            </Card>
            <Card title={s.buses} id="travel-buses">
              {data.buses.length === 0 ? (
                <p className="muted small">{s.noBuses}</p>
              ) : (
                <ul className="list" data-testid="bus-list">
                  {data.buses.map((b) => (
                    <BusRow
                      key={b.id}
                      org={org}
                      trip={trip}
                      bus={b}
                      busy={act.isPending}
                      onRemove={() => remove(b.id)}
                    />
                  ))}
                </ul>
              )}
              <BusForm
                groups={data.groups}
                busy={create.isPending}
                onSubmit={(b) => create.mutate(b)}
              />
              <p className="muted small">{s.driverRule}</p>
            </Card>
          </div>
          <p className="muted small">{s.rule}</p>
        </>
      ) : null}
    </SectionPage>
  );
}

function FlightRow({
  flight: f,
  busy,
  onStatus,
  onRemove,
}: {
  flight: Flight;
  busy: boolean;
  onStatus: (st: FlightStatus) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flight" data-testid={`booking-${f.id}`}>
      <span className="flight__icon" aria-hidden="true">
        <Icons.plane />
      </span>
      <div className="flight__route">
        <strong>
          {f.from} → {f.to}
        </strong>
        <span className="muted small">
          {f.code}
          {f.pnr ? ` · ${s.pnr} ${f.pnr}` : ''}
        </span>
      </div>
      <div className="flight__times">
        <span>
          {hhmm(f.departsAt)} → {hhmm(f.arrivesAt)}
        </span>
        <span className="muted small">{f.departsAt.slice(0, 10)}</span>
      </div>
      <span className="muted small">{s.pax(f.pax)}</span>
      <div className="missing__actions">
        <span className={chipOf(f.status)}>{strings.status[f.status]}</span>
        <select
          className="field__input"
          value={f.status}
          aria-label={s.statusOf(f.code)}
          disabled={busy}
          onChange={(e) => onStatus(e.target.value as FlightStatus)}
        >
          {FLIGHT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {strings.status[st]}
            </option>
          ))}
        </select>
        <RemoveButton name={f.code} busy={busy} onClick={onRemove} />
      </div>
    </li>
  );
}

function HotelRow({
  org,
  trip,
  hotel: h,
  busy,
  onRemove,
}: {
  org: Organization;
  trip: Trip;
  hotel: Hotel;
  busy: boolean;
  onRemove: () => void;
}) {
  // Slice 058 (D41): the rooming list unfolds under the row; the hotel's link sits beside it.
  const [roomingOpen, setRoomingOpen] = useState(false);
  return (
    <li className="hotel" data-testid={`booking-${h.id}`}>
      <span className="flight__icon" aria-hidden="true">
        <Icons.hotel />
      </span>
      <div className="flight__route">
        <strong>{h.name}</strong>
        <span className="muted small">
          {h.city} · {h.checkIn} → {h.checkOut} · {s.nights(h.nights)}
        </span>
        <span className="muted small">
          {s.rooms(h.rooms)}
          {h.confirmation ? ` · ${h.confirmation}` : ''}
        </span>
      </div>
      <div className="missing__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-label={s.roomingOf(h.name)}
          aria-expanded={roomingOpen}
          onClick={() => setRoomingOpen((v) => !v)}
        >
          {roomingOpen ? s.roomingHide : s.rooming}
        </button>
        <RemoveButton name={h.name} busy={busy} onClick={onRemove} />
      </div>
      {/* The list and the links span the row's columns (CSS .rooming, .driver-links). */}
      {roomingOpen ? <Rooming org={org} trip={trip} hotel={h} /> : null}
      <SealedLinks org={org} trip={trip} bookingId={h.id} kind="hotel" label={h.name} />
    </li>
  );
}

/** The rooming list of one hotel: a room field per leader and traveler, saved as it is confirmed. */
function Rooming({ org, trip, hotel }: { org: Organization; trip: Trip; hotel: Hotel }) {
  const qc = useQueryClient();
  const query = roomingQuery(org.id, trip.id, hotel.id);
  const list = useQuery(query);
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (input: { participationId: string; room: string | null; name: string }) =>
      travelApi.assignRoom(org.id, trip.id, hotel.id, {
        participationId: input.participationId,
        room: input.room,
      }),
    onSuccess: (next, input) => {
      qc.setQueryData(query.queryKey, next);
      setNote(s.roomSaved(input.name, input.room));
    },
    onError: (e) => setNote(errorText(e, s.roomFailed)),
  });
  if (list.isPending) {
    return (
      <p className="muted small" role="status">
        {strings.settings.loading}
      </p>
    );
  }
  if (list.isError) {
    return (
      <p className="muted small" role="status">
        {errorText(list.error, s.roomingFailed)}
      </p>
    );
  }
  const d = list.data;
  return (
    <div className="stack rooming" data-testid={`rooming-${hotel.id}`}>
      <strong className="small">
        {s.roomingSummary(d.assigned, d.people.length, d.roomsUsed, d.hotel.rooms)}
      </strong>
      <p className="muted small">{s.roomingHint}</p>
      <ul className="list list--plain small">
        {d.people.map((p) => (
          <RoomField
            key={p.participationId}
            person={p}
            busy={save.isPending}
            onSave={(room) =>
              save.mutate({ participationId: p.participationId, room, name: p.displayName })
            }
          />
        ))}
      </ul>
      <span className="field__hint" role="status">
        {note ?? ''}
      </span>
    </div>
  );
}

function RoomField({
  person: p,
  busy,
  onSave,
}: {
  person: RoomAssignment;
  busy: boolean;
  onSave: (room: string | null) => void;
}) {
  const [value, setValue] = useState(p.room ?? '');
  const commit = () => {
    const room = value.trim() === '' ? null : value.trim();
    if (room === (p.room ?? null)) return;
    onSave(room);
  };
  return (
    <li className="field__row field__row--tight rooming__row">
      <span>
        {p.role === 'leader' ? <strong>{p.displayName}</strong> : p.displayName}
        {p.groupName ? <span className="muted small"> · {p.groupName}</span> : null}
      </span>
      <input
        className="field__input"
        style={{ maxWidth: 120 }}
        value={value}
        placeholder={s.roomUnassigned}
        aria-label={s.roomOf(p.displayName)}
        disabled={busy}
        maxLength={20}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
    </li>
  );
}

function BusRow({
  org,
  trip,
  bus: b,
  busy,
  onRemove,
}: {
  org: Organization;
  trip: Trip;
  bus: BusCharter;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="busrow" data-testid={`booking-${b.id}`}>
      <div className="flight__route">
        <strong>{b.label}</strong>
        <span className="muted small">
          {b.company}
          {b.driverContact ? ` · ${s.driver}: ${b.driverContact}` : ''}
        </span>
        <span className="muted small">
          {b.groups.length > 0 ? s.groups(b.groups.join(', ')) : ''}
        </span>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <Meter
          value={b.assigned}
          max={b.seats}
          tone={b.assigned > b.seats ? 'danger' : 'brand'}
          label={s.seats(b.assigned, b.seats)}
        />
        <span className="small">{s.seats(b.assigned, b.seats)}</span>
      </div>
      <RemoveButton name={b.label} busy={busy} onClick={onRemove} />
      <SealedLinks org={org} trip={trip} bookingId={b.id} kind="driver" label={b.label} />
    </li>
  );
}

/** The driver's sealed links of one bus (D39): mint (the URL shows once), list with opens, revoke. */
/**
 * The sealed links of a booking (the driver's since slice 049, the hotel's since slice 058): mint
 * one (the URL shows once), list them with their opens, revoke one. The same shape for both; the
 * words and the test ids differ by kind.
 */
function SealedLinks({
  org,
  trip,
  bookingId,
  kind,
  label,
}: {
  org: Organization;
  trip: Trip;
  bookingId: string;
  kind: 'driver' | 'hotel';
  /** The bus label or the hotel name, for the spoken names. */
  label: string;
}) {
  const qc = useQueryClient();
  const query =
    kind === 'driver'
      ? driverLinksQuery(org.id, trip.id, bookingId)
      : hotelLinksQuery(org.id, trip.id, bookingId);
  const words =
    kind === 'driver'
      ? {
          button: s.driverLink,
          buttonOf: s.driverLinkOf(label),
          minted: s.driverLinkMinted,
          none: s.driverLinksNone,
        }
      : {
          button: s.hotelLink,
          buttonOf: s.hotelLinkOf(label),
          minted: s.hotelLinkMinted,
          none: s.hotelLinksNone,
        };
  const links = useQuery(query);
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: query.queryKey });
  const mint = useMutation({
    mutationFn: () =>
      kind === 'driver'
        ? travelApi.createDriverLink(org.id, trip.id, bookingId)
        : travelApi.createHotelLink(org.id, trip.id, bookingId),
    onSuccess: (r) => {
      setMinted(r.url);
      setCopied(false);
      setNote(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.driverLinkFailed)),
  });
  const revoke = useMutation({
    mutationFn: (linkId: string) =>
      kind === 'driver'
        ? travelApi.revokeDriverLink(org.id, trip.id, bookingId, linkId)
        : travelApi.revokeHotelLink(org.id, trip.id, bookingId, linkId),
    onSuccess: () => {
      setNote(null);
      void refresh();
    },
    onError: (e) => setNote(errorText(e, s.actionFailed)),
  });
  const copy = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const rows = links.data?.links ?? [];
  return (
    <div className="stack driver-links" data-testid={`${kind}-links-${bookingId}`}>
      <div className="missing__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={mint.isPending}
          onClick={() => mint.mutate()}
          aria-label={words.buttonOf}
        >
          {mint.isPending ? s.driverLinkMinting : words.button}
        </button>
        <span className="field__hint" role="status">
          {note ?? ''}
        </span>
      </div>
      {minted ? (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small">{words.minted}</span>
          <input
            className="field__input"
            readOnly
            value={minted}
            aria-label={words.buttonOf}
            data-testid={`${kind}-link-url`}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="missing__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copy()}>
              {copied ? s.driverLinkCopied : s.driverLinkCopy}
            </button>
            <a className="btn btn--ghost btn--sm" href={minted} target="_blank" rel="noreferrer">
              {s.driverLinkOpen}
            </a>
          </div>
        </div>
      ) : null}
      {links.data ? (
        rows.length === 0 ? (
          <span className="muted small">{words.none}</span>
        ) : (
          <ul className="list list--plain small" data-testid={`${kind}-links`}>
            {rows.map((l) => {
              const mintedOn = l.createdAt.slice(0, 10);
              return (
                <li key={l.id} className={l.revokedAt ? 'checklist__done' : ''}>
                  {s.driverLinkLine(mintedOn, l.expiresAt.slice(0, 10), l.opens)}
                  {l.revokedAt ? (
                    <span className="chip chip--expired">{s.driverLinkRevoked}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(l.id)}
                      aria-label={s.driverLinkRevokeOf(mintedOn)}
                    >
                      {s.driverLinkRevoke}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

function RemoveButton({
  name,
  busy,
  onClick,
}: {
  name: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      disabled={busy}
      onClick={onClick}
      aria-label={s.removeOf(name)}
    >
      {s.remove}
    </button>
  );
}

/** A labelled input; `id` ties the label to the control (the same markup Preparation uses inline). */
function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SubmitRow({
  busy,
  ready,
  status,
}: {
  busy: boolean;
  ready: boolean;
  status?: React.ReactNode;
}) {
  return (
    <div className="field__row field__row--tight">
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !ready}>
        <Icons.plus /> {busy ? s.adding : s.add}
      </button>
      {status}
    </div>
  );
}

function FlightForm({
  busy,
  onSubmit,
  status,
}: {
  busy: boolean;
  onSubmit: (b: CreateBookingRequest) => void;
  status: React.ReactNode;
}) {
  const [code, setCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departsAt, setDepartsAt] = useState('');
  const [arrivesAt, setArrivesAt] = useState('');
  const [pax, setPax] = useState('0');
  const [pnr, setPnr] = useState('');
  const ready = Boolean(code.trim() && from.trim() && to.trim() && departsAt && arrivesAt);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onSubmit({
      kind: 'flight',
      code: code.trim(),
      from: from.trim(),
      to: to.trim(),
      departsAt,
      arrivesAt,
      pax: int(pax, 0),
      pnr: pnr.trim(),
      status: 'scheduled',
    });
    setCode('');
    setPnr('');
  };
  return (
    <form className="form" onSubmit={submit} aria-label={s.addFlight} noValidate>
      <div className="field__row">
        <Field label={s.codeLabel} id="travel-code">
          <input
            id="travel-code"
            className="field__input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={40}
            required
          />
        </Field>
        <Field label={s.fromLabel} id="travel-from">
          <input
            id="travel-from"
            className="field__input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            maxLength={80}
            required
          />
        </Field>
        <Field label={s.toLabel} id="travel-to">
          <input
            id="travel-to"
            className="field__input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            maxLength={80}
            required
          />
        </Field>
      </div>
      <div className="field__row">
        <Field label={s.departsLabel} id="travel-departs">
          <input
            id="travel-departs"
            className="field__input"
            type="datetime-local"
            value={departsAt}
            onChange={(e) => setDepartsAt(e.target.value)}
            required
          />
        </Field>
        <Field label={s.arrivesLabel} id="travel-arrives">
          <input
            id="travel-arrives"
            className="field__input"
            type="datetime-local"
            value={arrivesAt}
            onChange={(e) => setArrivesAt(e.target.value)}
            required
          />
        </Field>
        <Field label={s.paxLabel} id="travel-pax">
          <input
            id="travel-pax"
            className="field__input"
            type="number"
            min={0}
            max={999}
            value={pax}
            onChange={(e) => setPax(e.target.value)}
          />
        </Field>
        <Field label={s.pnrLabel} id="travel-pnr">
          <input
            id="travel-pnr"
            className="field__input"
            value={pnr}
            onChange={(e) => setPnr(e.target.value)}
            maxLength={40}
          />
        </Field>
      </div>
      <SubmitRow busy={busy} ready={ready} status={status} />
    </form>
  );
}

function HotelForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (b: CreateBookingRequest) => void;
}) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState('0');
  const [confirmation, setConfirmation] = useState('');
  const ready = Boolean(name.trim() && city.trim() && checkIn && checkOut);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onSubmit({
      kind: 'hotel',
      name: name.trim(),
      city: city.trim(),
      checkIn,
      checkOut,
      rooms: int(rooms, 0),
      confirmation: confirmation.trim(),
    });
    setName('');
    setConfirmation('');
  };
  return (
    <form className="form" onSubmit={submit} aria-label={s.addHotel} noValidate>
      <div className="field__row">
        <Field label={s.nameLabel} id="travel-name">
          <input
            id="travel-name"
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
        </Field>
        <Field label={s.cityLabel} id="travel-city">
          <input
            id="travel-city"
            className="field__input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={80}
            required
          />
        </Field>
      </div>
      <div className="field__row">
        <Field label={s.checkInLabel} id="travel-checkin">
          <input
            id="travel-checkin"
            className="field__input"
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            required
          />
        </Field>
        <Field label={s.checkOutLabel} id="travel-checkout">
          <input
            id="travel-checkout"
            className="field__input"
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            required
          />
        </Field>
        <Field label={s.roomsLabel} id="travel-rooms">
          <input
            id="travel-rooms"
            className="field__input"
            type="number"
            min={0}
            max={999}
            value={rooms}
            onChange={(e) => setRooms(e.target.value)}
          />
        </Field>
        <Field label={s.confirmationLabel} id="travel-confirmation">
          <input
            id="travel-confirmation"
            className="field__input"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            maxLength={40}
          />
        </Field>
      </div>
      <SubmitRow busy={busy} ready={ready} />
    </form>
  );
}

function BusForm({
  groups,
  busy,
  onSubmit,
}: {
  groups: string[];
  busy: boolean;
  onSubmit: (b: CreateBookingRequest) => void;
}) {
  const [label, setLabel] = useState('');
  const [company, setCompany] = useState('');
  const [seats, setSeats] = useState('45');
  const [driverContact, setDriverContact] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const ready = Boolean(label.trim() && company.trim() && int(seats, 0) >= 1);
  const toggle = (g: string, on: boolean) =>
    setPicked((prev) => (on ? [...prev.filter((x) => x !== g), g] : prev.filter((x) => x !== g)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onSubmit({
      kind: 'bus',
      label: label.trim(),
      company: company.trim(),
      seats: int(seats, 1),
      driverContact: driverContact.trim(),
      groups: groups.filter((g) => picked.includes(g)),
    });
    setLabel('');
    setPicked([]);
  };
  return (
    <form className="form" onSubmit={submit} aria-label={s.addBus} noValidate>
      <div className="field__row">
        <Field label={s.labelLabel} id="travel-label">
          <input
            id="travel-label"
            className="field__input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            required
          />
        </Field>
        <Field label={s.companyLabel} id="travel-company">
          <input
            id="travel-company"
            className="field__input"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={80}
            required
          />
        </Field>
        <Field label={s.seatsLabel} id="travel-seats">
          <input
            id="travel-seats"
            className="field__input"
            type="number"
            min={1}
            max={200}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
        </Field>
      </div>
      <Field label={s.driverLabel} id="travel-driver">
        <input
          id="travel-driver"
          className="field__input"
          value={driverContact}
          onChange={(e) => setDriverContact(e.target.value)}
          maxLength={120}
        />
      </Field>
      <fieldset className="field" data-testid="bus-groups">
        <legend className="field__label">{s.groupsLabel}</legend>
        {groups.length === 0 ? (
          <span className="muted small">{s.noGroups}</span>
        ) : (
          groups.map((g) => (
            <label key={g} className="checklist__item">
              <input
                type="checkbox"
                checked={picked.includes(g)}
                onChange={(e) => toggle(g, e.target.checked)}
              />{' '}
              {g}
            </label>
          ))
        )}
      </fieldset>
      <SubmitRow busy={busy} ready={ready} />
    </form>
  );
}

/** The sample page (slice 008): the Korea Concert Tour fixture with the "Sample data" chip. */
function FixtureTravel() {
  return (
    <SectionPage title={strings.nav.travel} subtitle={s.subtitle}>
      <Card title={s.flights} id="travel-flights">
        <ul className="list" data-testid="flight-list">
          {flights.map((f) => (
            <li key={f.id} className="flight">
              <span className="flight__icon" aria-hidden="true">
                <Icons.plane />
              </span>
              <div className="flight__route">
                <strong>
                  {f.from} → {f.to}
                </strong>
                <span className="muted small">
                  {f.code} · {s.pnr} {f.pnr}
                </span>
              </div>
              <div className="flight__times">
                <span>
                  {hhmm(f.departs)} → {hhmm(f.arrives)}
                </span>
                <span className="muted small">{f.departs.slice(0, 10)}</span>
              </div>
              <span className="muted small">{s.pax(f.pax)}</span>
              <span className={`chip chip--${f.status}`}>{strings.status[f.status]}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid">
        <Card title={s.hotels} id="travel-hotels">
          <ul className="list" data-testid="hotel-list">
            {hotels.map((h) => (
              <li key={h.id} className="hotel">
                <span className="flight__icon" aria-hidden="true">
                  <Icons.hotel />
                </span>
                <div className="flight__route">
                  <strong>{h.name}</strong>
                  <span className="muted small">
                    {h.city} · {h.checkIn} → {h.checkOut} · {s.nights(h.nights)}
                  </span>
                </div>
                <span className="muted small">
                  {s.rooms(h.rooms)} · {h.confirmation}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={s.buses} id="travel-buses">
          <ul className="list" data-testid="bus-list">
            {buses.map((b) => (
              <li key={b.id} className="busrow">
                <div className="flight__route">
                  <strong>{b.label}</strong>
                  <span className="muted small">
                    {b.company} · {s.driver}: {b.driverContact}
                  </span>
                </div>
                <Meter value={b.assigned} max={b.seats} label={s.seats(b.assigned, b.seats)} />
                <span className="small">{s.seats(b.assigned, b.seats)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{s.driverRule}</p>
        </Card>
      </div>
    </SectionPage>
  );
}
