// Copyright 2026- At Day. All rights reserved.
// Facts: every sample section renders its heading and the "Sample data" chip; counts derive from
// the fixtures; People filters narrow the table; chart scale helper rounds to clean maxima.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BillingPage } from './BillingPage';
import { CommunicationPage } from './CommunicationPage';
import { niceMax } from './charts';
import { JourneyGraphPage } from './JourneyGraphPage';
import { MediaPage } from './MediaPage';
import { PeoplePage } from './PeoplePage';
import { PreparationPage } from './PreparationPage';
import { ReportsPage } from './ReportsPage';
import { SafetyPage } from './SafetyPage';
import { SettingsPage } from './SettingsPage';
import { TravelPage } from './TravelPage';

afterEach(cleanup);

const text = (el: Element | null) => el?.textContent ?? '';

const PAGES = [
  ['People', PeoplePage],
  ['Communication', CommunicationPage],
  ['Safety', SafetyPage],
  ['Journey Graph', JourneyGraphPage],
  ['Travel', TravelPage],
  ['Media', MediaPage],
  ['Preparation', PreparationPage],
  ['Reports', ReportsPage],
  ['Billing', BillingPage],
  ['Settings', SettingsPage],
] as const;

describe('sample sections', () => {
  for (const [title, Page] of PAGES) {
    it(`${title}: heading and Sample data chip`, () => {
      render(<Page />);
      expect(text(screen.getByRole('heading', { level: 1 }))).toBe(title);
      expect(screen.getByText('Sample data')).toBeTruthy();
    });
  }

  it('People: filters narrow the table and guardians show their traveler', () => {
    render(<PeoplePage />);
    const table = screen.getByTestId('people-table');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 19);
    fireEvent.click(screen.getByRole('button', { name: 'Guardians' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 5);
    expect(text(table)).toContain('guardian of Minji Park');
    fireEvent.click(screen.getByRole('button', { name: 'Bus A' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 2);
    expect(text(screen.getByTestId('people-joined'))).toBe('61');
  });

  it('Communication: ack counts and unacked names per announcement', () => {
    render(<CommunicationPage />);
    expect(text(screen.getByTestId('ack-a1'))).toBe('36/38');
    expect(text(screen.getByTestId('announcement-list'))).toContain('Seojun Choi, Jiwoo Han');
    expect(within(screen.getByTestId('channel-list')).getAllByRole('listitem')).toHaveLength(5);
  });

  it('Safety: window state counts and missing list', () => {
    render(<SafetyPage />);
    expect(text(screen.getByTestId('win-inside'))).toBe('6');
    expect(text(screen.getByTestId('win-outside'))).toBe('1');
    expect(text(screen.getByTestId('win-opted_out'))).toBe('1');
    expect(within(screen.getByTestId('missing-list')).getAllByRole('listitem')).toHaveLength(2);
    expect(within(screen.getByTestId('incident-list')).getAllByRole('listitem')).toHaveLength(2);
  });

  it('Journey graph: ten nodes today, tight connections flagged', () => {
    render(<JourneyGraphPage />);
    expect(screen.getAllByTestId(/^node-/)).toHaveLength(10);
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '3 tight connections',
    );
  });

  it('Reports: KPIs derive from day metrics and documents', () => {
    render(<ReportsPage />);
    expect(text(screen.getByTestId('kpi-Average ack rate'))).toBe('86%');
    expect(text(screen.getByTestId('kpi-Last head count closed in'))).toBe('6 min');
    expect(text(screen.getByTestId('kpi-Required documents'))).toBe('97%');
    expect(screen.getAllByText('Table view')).toHaveLength(2);
  });

  it('Billing: ledger totals and per-row status chips', () => {
    render(<BillingPage />);
    expect(text(screen.getByTestId('ledger-collected'))).toBe(
      '₩82,800,000 of ₩88,800,000 collected',
    );
    expect(within(screen.getByTestId('ledger-table')).getAllByRole('row')).toHaveLength(1 + 6);
    expect(screen.getByText('Unpaid')).toBeTruthy();
  });

  it('Media: flagged photos sit in the queue, not the pool', () => {
    render(<MediaPage />);
    expect(within(screen.getByTestId('media-queue')).getAllByRole('listitem')).toHaveLength(3);
    expect(within(screen.getByTestId('media-pool')).getAllByRole('figure')).toHaveLength(15);
  });

  it('Preparation: per-document counts', () => {
    render(<PreparationPage />);
    expect(text(screen.getByTestId('doc-d2'))).toBe('36/38');
    expect(text(screen.getByRole('heading', { level: 1 }).parentElement)).toContain(
      '5 required documents still missing',
    );
  });
});

describe('niceMax', () => {
  it('rounds to clean axis maxima', () => {
    expect(niceMax([0])).toBe(10);
    expect(niceMax([14])).toBe(15);
    expect(niceMax([71, 95])).toBe(100);
    expect(niceMax([6, 9])).toBe(10);
    expect(niceMax([120])).toBe(150);
  });
});
