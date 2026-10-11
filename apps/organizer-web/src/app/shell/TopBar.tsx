// Copyright 2026- At Day. All rights reserved.
// Top bar: active org/trip context, search, notifications, account. Context stays visible on
// every page (doc 01 §16.1).

import { strings } from '../../lib/strings';
import { Icons } from './icons';

export function TopBar({
  orgName,
  tripName,
  tripStatus,
  accountLabel,
  hasAlerts,
  onSignOut,
  onMenu,
  menuOpen,
}: {
  orgName: string;
  tripName: string | null;
  tripStatus: 'active' | 'planning' | 'completed' | null;
  /** Email of the signed-in account; initials derive from it. */
  accountLabel: string;
  hasAlerts: boolean;
  onSignOut: () => void;
  onMenu: () => void;
  menuOpen: boolean;
}) {
  const initials = accountLabel.slice(0, 2).toUpperCase();
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
        {tripName ? (
          <>
            <span aria-hidden="true">/</span>
            <span>{tripName}</span>
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
      <button type="button" className="iconbtn" aria-label={strings.topbar.notifications}>
        <Icons.bell />
        {hasAlerts ? <span className="iconbtn__dot" aria-hidden="true" /> : null}
      </button>
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
