// Copyright 2026- At Day. All rights reserved.
// Facts: each view state renders its distinguishing content; numbers derive from the fixture;
// red alerts sort first; offline shows the banner with live content.

import { cleanup, render, screen, within } from '@testing-library/react';
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

  it('error: alert with reference and working retry', () => {
    const retry = vi.fn();
    render(<CommandCenterView state={{ kind: 'error', correlationId: 'corr-x', retry }} />);
    expect(text(screen.getByRole('alert'))).toContain('corr-x');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
