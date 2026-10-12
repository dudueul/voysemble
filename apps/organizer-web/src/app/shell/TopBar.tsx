// Copyright 2026- At Day. All rights reserved.
// Top bar: active org/trip context, search, notifications, account. Context stays visible on
// every page (doc 01 §16.1). Since slice 063 the trip is a switch when the organization has more
// than one: a native select, so a keyboard and a screen reader get it for free.

import { getLocale, localeName, otherLocale, strings } from '../../lib/strings';
import { Icons } from './icons';

export function TopBar({
  orgName,
  trips,
  activeTripId,
  tripStatus,
  accountLabel,
  hasAlerts,
  onSignOut,
  onMenu,
  menuOpen,
  onSwitchLocale,
  onSwitchTrip,
}: {
  orgName: string;
  /** The organization's trips; the active one is named, the rest are a switch away. */
  trips: { id: string; name: string }[];
  activeTripId: string | null;
  tripStatus: 'active' | 'planning' | 'completed' | null;
  /** Email of the signed-in account; initials derive from it. */
  accountLabel: string;
  hasAlerts: boolean;
  onSignOut: () => void;
  onMenu: () => void;
  menuOpen: boolean;
  /** Slice 038: switch the console to the other language (and the account's preference). */
  onSwitchLocale: () => void;
  /** Slice 063: the organizer picked another trip; the whole console follows. */
  onSwitchTrip: (tripId: string) => void;
}) {
  const activeTrip = trips.find((t) => t.id === activeTripId) ?? null;
  const initials = accountLabel.slice(0, 2).toUpperCase();
  const other = otherLocale(getLocale());
  return (
    <header className="topbar">
      <button
        type="button"
        className="iconbtn menubtn"
        aria-label={strings.topbar.menu}
        aria-expanded={menuOpen}
        aria-controls="primary-nav"
        onClick={onMenu}
      >
        <Icons.menu />
      </button>
      <section className="topbar__context" aria-label="Current organization and trip">
        <span>{orgName}</span>
        {activeTrip ? (
          <>
            <span aria-hidden="true">/</span>
            {trips.length > 1 ? (
              <select
                className="topbar__trip"
                aria-label={strings.topbar.trip}
                data-testid="trip-switcher"
                value={activeTrip.id}
                onChange={(e) => onSwitchTrip(e.target.value)}
              >
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <span>{activeTrip.name}</span>
            )}
            {tripStatus ? (
              <span className={`chip chip--${tripStatus}`}>{strings.tripStatus[tripStatus]}</span>
            ) : null}
          </>
        ) : null}
      </section>
      <search className="topbar__search">
        <Icons.search />
        <input
          type="search"
          placeholder={strings.topbar.search}
          aria-label={strings.topbar.search}
        />
      </search>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        lang={other}
        aria-label={strings.topbar.switchLanguage(localeName[other])}
        data-testid="locale-toggle"
        onClick={onSwitchLocale}
      >
        {localeName[other]}
      </button>
      <a className="iconbtn" aria-label={strings.topbar.notifications} href="/notifications">
        <Icons.bell />
        {hasAlerts ? <span className="iconbtn__dot" aria-hidden="true" /> : null}
      </a>
      <button
        type="button"
        className="avatar"
        aria-label={`${strings.topbar.account}: ${accountLabel}`}
        title={accountLabel}
      >
        {initials}
      </button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onSignOut}>
        {strings.auth.signOut}
      </button>
    </header>
  );
}
