// Copyright 2026- At Day. All rights reserved.
// Left navigation per doc 01 §16.1. Active item uses aria-current, not color alone.

import { Link } from '@tanstack/react-router';
import { strings } from '../../lib/strings';
import { type IconName, Icons } from './icons';

export const NAV: ReadonlyArray<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: strings.nav.today, icon: 'today' },
  { to: '/itinerary', label: strings.nav.itinerary, icon: 'itinerary' },
  { to: '/journey-graph', label: strings.nav.journeyGraph, icon: 'graph' },
  { to: '/people', label: strings.nav.people, icon: 'people' },
  { to: '/communication', label: strings.nav.communication, icon: 'chat' },
  { to: '/travel', label: strings.nav.travel, icon: 'plane' },
  { to: '/safety', label: strings.nav.safety, icon: 'shield' },
  { to: '/media', label: strings.nav.media, icon: 'media' },
  { to: '/preparation', label: strings.nav.preparation, icon: 'checklist' },
  { to: '/reports', label: strings.nav.reports, icon: 'chart' },
  { to: '/billing', label: strings.nav.billing, icon: 'card' },
  { to: '/settings', label: strings.nav.settings, icon: 'settings' },
];

export function Sidebar({
  orgName,
  showSetup,
  open,
  onClose,
}: {
  orgName: string;
  showSetup: boolean;
  /** Phone drawer state; ignored at wider widths where the rail is always visible. */
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div className={`sidebar-col${open ? ' sidebar-col--open' : ''}`}>
      {open ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={strings.topbar.closeMenu}
          onClick={onClose}
        />
      ) : null}
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar__brand">
          <Icons.logo />
          <div>
            {strings.app.name}
            <small>{strings.app.console}</small>
          </div>
        </div>
        <nav className="sidebar__nav" aria-label="Sections" id="primary-nav">
          {/* Setup is pinned on top until the first organization exists; stays reachable at /setup. */}
          {showSetup ? (
            <Link
              to="/setup"
              className="navlink navlink--accent"
              activeProps={{ 'aria-current': 'page' }}
            >
              <Icons.checklist />
              <span>{strings.setup.nav}</span>
            </Link>
          ) : null}
          {NAV.map((item) => {
            const Icon = Icons[item.icon];
            return (
              <Link
                key={item.to}
                to={item.to}
                className="navlink"
                activeOptions={{ exact: item.to === '/' }}
                activeProps={{ 'aria-current': 'page' }}
              >
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar__footer">{orgName}</div>
      </aside>
    </div>
  );
}
