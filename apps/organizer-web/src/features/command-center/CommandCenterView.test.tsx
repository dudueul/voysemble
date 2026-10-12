// Copyright 2026- At Day. All rights reserved.
// Facts: each view state renders its distinguishing content; numbers derive from the fixture;
// red alerts sort first; offline shows the banner with live content. Slice 063: an alert's
// first action is a link where it leads; the Trips panel's "Open" switches (never on the active
// row, never without the callback); "New trip" folds out a form that creates and closes; the
// offline state says so and retries.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardFixture } from '../../fixtures/korea-concert-tour';
import { CommandCenterView } from './CommandCenterView';

const text = (el: Element | null) => el?.textContent ?? '';

afterEach(cleanup);

describe('CommandCenterView', () => {
  it('ready: tiles, head count, red alert first', () => {
    render(<CommandCenterView state={{ kind: 'ready', data: dashboardFixture }} />);
    expect(text(screen.getByRole('heading', { level: 1 }))).toBe('Welcome back, Nathan');
    expect(text(screen.getByTestId('stat-Active trips'))).toBe('1');
    expect(text(screen.getByTestId('stat-Travelers'))).toBe('38');
    expect(text(screen.getByTestId('stat-Acknowledged'))).toBe('94%');
    expect(text(screen.getByTestId('stat-Open alerts'))).toBe('2');
    expect(text(screen.getByTestId('hc-total'))).toBe('34/38');
    expect(text(screen.getByTestId('hc-Bus A'))).toContain('2 missing');
    const alerts = screen.getAllByRole('article');
    expect(within(alerts[0] as HTMLElement).getByText('Urgent')).toBeTruthy();
    expect(screen.getByText('Day 4', { exact: false })).toBeTruthy();
  });

  it('ready + live: Live chip, empty panels explain themselves', () => {
    render(
      <CommandCenterView
        state={{
          kind: 'ready',
          data: {
            ...dashboardFixture,
            live: true,
            movements: [],
            headcount: [],
            announcements: [],
          },
        }}
      />,
    );
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.getByText('No head count yet.', { exact: false })).toBeTruthy();
    expect(screen.getByText('No movements in the next 48 hours.', { exact: false })).toBeTruthy();
    expect(text(screen.getByTestId('hc-total'))).toBe('0/0');
    expect(text(screen.getByTestId('stat-Acknowledged'))).toBe('—');
  });

  it('subtitle: day number during the trip, countdown before, ended after', () => {
    const trip = dashboardFixture.trips[0] as (typeof dashboardFixture.trips)[number];
    const at = (now: string) =>
      render(
        <CommandCenterView
          state={{ kind: 'ready', data: { ...dashboardFixture, now, trips: [trip] } }}
        />,
      );
    at('2026-12-31T06:12:00Z');
    expect(screen.getByText('Day 4', { exact: false })).toBeTruthy();
    cleanup();
    at('2026-12-01T06:12:00Z');
    expect(screen.getByText('starts in 27 days', { exact: false })).toBeTruthy();
    cleanup();
    at('2027-01-20T06:12:00Z');
    expect(screen.getByText('Korea Concert Tour · ended', { exact: false })).toBeTruthy();
  });

  it('ready + empty: shows create-a-trip call to action', () => {
    render(
      <CommandCenterView
        state={{
          kind: 'ready',
          data: {
            ...dashboardFixture,
            trips: [],
            activeTripId: null,
            alerts: [],
            headcount: [],
            movements: [],
            announcements: [],
          },
        }}
      />,
    );
    expect(text(screen.getByRole('status'))).toContain('No trips yet');
    expect(screen.getByRole('button', { name: 'Create a trip' })).toBeTruthy();
  });

  it('ready + offline: banner plus last-sync content', () => {
    render(
      <CommandCenterView state={{ kind: 'ready', data: { ...dashboardFixture, offline: true } }} />,
    );
    expect(text(screen.getByRole('status'))).toContain('You are offline');
    expect(text(screen.getByTestId('hc-total'))).toBe('34/38');
  });

  it('loading: busy region, no numbers', () => {
    render(<CommandCenterView state={{ kind: 'loading' }} />);
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('hc-total')).toBeNull();
  });

  it('alerts: the first action is a link where the alert leads, a button otherwise (slice 063)', () => {
    render(<CommandCenterView state={{ kind: 'ready', data: dashboardFixture }} />);
    const first = screen.getAllByRole('article')[0] as HTMLElement;
    expect(within(first).getByRole('link', { name: 'Review proposal' }).getAttribute('href')).toBe(
      '/itinerary',
    );
    expect(within(first).getByRole('button', { name: 'Message guardians' })).toBeTruthy();
    cleanup();
    const alert = dashboardFixture.alerts[0] as (typeof dashboardFixture.alerts)[number];
    const { to: _to, ...noTarget } = alert;
    render(
      <CommandCenterView
        state={{ kind: 'ready', data: { ...dashboardFixture, alerts: [noTarget] } }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Review proposal' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Review proposal' })).toBeNull();
  });

  it('trips: "Open" switches to another trip; the active row and the sample have none (slice 063)', () => {
    const onSwitchTrip = vi.fn();
    render(
      <CommandCenterView
        state={{ kind: 'ready', data: dashboardFixture }}
        onSwitchTrip={onSwitchTrip}
      />,
    );
    const other = dashboardFixture.trips.find((t) => t.id !== dashboardFixture.activeTripId);
    const active = dashboardFixture.trips.find((t) => t.id === dashboardFixture.activeTripId);
    if (!other || !active) throw new Error('fixture needs two trips');
    expect(screen.queryByRole('button', { name: `Open ${active.name}` })).toBeNull();
    screen.getByRole('button', { name: `Open ${other.name}` }).click();
    expect(onSwitchTrip).toHaveBeenCalledWith(other.id);
    cleanup();
    render(<CommandCenterView state={{ kind: 'ready', data: dashboardFixture }} />);
    expect(screen.queryByRole('button', { name: `Open ${other.name}` })).toBeNull();
  });

  it('trips: "New trip" folds out a form that creates the trip and closes (slice 063)', async () => {
    const onCreateTrip = vi.fn(async () => undefined);
    render(
      <CommandCenterView
        state={{ kind: 'ready', data: dashboardFixture }}
        onCreateTrip={onCreateTrip}
      />,
    );
    expect(screen.queryByRole('form', { name: 'New trip' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New trip' }));
    const form = screen.getByRole('form', { name: 'New trip' });
    fireEvent.change(within(form).getByLabelText('Trip name'), {
      target: { value: 'Autumn Science Camp' },
    });
    fireEvent.change(within(form).getByLabelText('Starts'), { target: { value: '2027-10-04' } });
    fireEvent.change(within(form).getByLabelText('Ends'), { target: { value: '2027-10-08' } });
    // The zone starts as the active trip's (the sample tour is in Rome).
    expect((within(form).getByLabelText('Time zone') as HTMLInputElement).value).toBe(
      'Europe/Rome',
    );
    fireEvent.submit(form);
    await waitFor(() => expect(onCreateTrip).toHaveBeenCalledTimes(1));
    expect(onCreateTrip).toHaveBeenCalledWith({
      name: 'Autumn Science Camp',
      startsOn: '2027-10-04',
      endsOn: '2027-10-08',
      timezone: 'Europe/Rome',
    });
    await waitFor(() => expect(screen.queryByRole('form', { name: 'New trip' })).toBeNull());
  });

  it('offline before any load: says so and retries (slice 063)', () => {
    const retry = vi.fn();
    render(<CommandCenterView state={{ kind: 'offline', retry }} />);
    expect(text(screen.getByRole('status'))).toContain('You are offline');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('error: alert with reference and working retry', () => {
    const retry = vi.fn();
    render(<CommandCenterView state={{ kind: 'error', correlationId: 'corr-x', retry }} />);
    expect(text(screen.getByRole('alert'))).toContain('corr-x');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
