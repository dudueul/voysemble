// Copyright 2026- At Day. All rights reserved.
// Facts (slice 063): with one trip the top bar names it; with more the name is a select that
// lists them all, holds the active one and reports a change; without a trip the context is the
// organization alone.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

afterEach(cleanup);

const trips = [
  { id: 'tr_winter', name: 'Korea Concert Tour 2026' },
  { id: 'tr_spring', name: 'Spring Choir Exchange' },
];

function bar(list: typeof trips, activeTripId: string | null, onSwitchTrip = vi.fn()) {
  render(
    <TopBar
      orgName="Seoul Arts High"
      trips={list}
      activeTripId={activeTripId}
      tripStatus={activeTripId ? 'planning' : null}
      accountLabel="nate@example.com"
      hasAlerts={false}
      onSignOut={() => undefined}
      onMenu={() => undefined}
      menuOpen={false}
      onSwitchLocale={() => undefined}
      onSwitchTrip={onSwitchTrip}
    />,
  );
  return onSwitchTrip;
}

describe('TopBar', () => {
  it('names a lone trip, with its status', () => {
    bar([trips[0] as (typeof trips)[number]], 'tr_winter');
    expect(screen.getByText('Korea Concert Tour 2026')).toBeTruthy();
    expect(screen.queryByTestId('trip-switcher')).toBeNull();
    expect(screen.getByText('Planning')).toBeTruthy();
  });

  it('switches between trips', () => {
    const onSwitchTrip = bar(trips, 'tr_spring');
    const select = screen.getByTestId('trip-switcher') as HTMLSelectElement;
    expect(select.value).toBe('tr_spring');
    expect(screen.getByRole('combobox', { name: 'Trip' })).toBe(select);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Korea Concert Tour 2026',
      'Spring Choir Exchange',
    ]);
    fireEvent.change(select, { target: { value: 'tr_winter' } });
    expect(onSwitchTrip).toHaveBeenCalledWith('tr_winter');
  });

  it('initials come from the account name when set (slice 069)', () => {
    render(
      <TopBar
        orgName="Seoul Arts High"
        trips={[]}
        activeTripId={null}
        tripStatus={null}
        accountLabel="nate@example.com"
        accountName="Nate Kim"
        hasAlerts={false}
        onSignOut={() => undefined}
        onMenu={() => undefined}
        menuOpen={false}
        onSwitchLocale={() => undefined}
        onSwitchTrip={() => undefined}
      />,
    );
    const avatar = screen.getByRole('button', { name: 'Account: Nate Kim' });
    expect(avatar.textContent).toBe('NA');
    expect(avatar.getAttribute('title')).toBe('Nate Kim · nate@example.com');
  });

  it('shows the organization alone without a trip', () => {
    bar([], null);
    expect(screen.getByText('Seoul Arts High')).toBeTruthy();
    expect(screen.queryByTestId('trip-switcher')).toBeNull();
    expect(screen.queryByText('/')).toBeNull();
  });
});
