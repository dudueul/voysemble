// Copyright 2026- At Day. All rights reserved.
// Facts: 13 days render; selecting a day shows its events; selecting an event opens the form;
// editing the title creates a draft and enables Publish; publish bumps the revision text.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useReducer } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { itineraryFixture } from '../../fixtures/itinerary';
import { ItineraryView } from './ItineraryView';
import { editorReducer, initEditor } from './itinerary-model';

afterEach(cleanup);

function Harness({ day }: { day?: string }) {
  const [editor, dispatch] = useReducer(editorReducer, itineraryFixture, (it) =>
    initEditor(it, day),
  );
  return <ItineraryView state={{ kind: 'ready', editor, dispatch }} />;
}

const text = (el: Element | null) => el?.textContent ?? '';

describe('ItineraryView', () => {
  it('renders the day rail and the selected day timeline', () => {
    render(<Harness day="2026-12-31" />);
    const rail = screen.getByRole('navigation', { name: 'Days' });
    expect(within(rail).getAllByRole('button')).toHaveLength(13);
    expect(
      text(screen.getByRole('heading', { level: 2, name: /Thursday, December 31/ })),
    ).toContain('December 31');
    expect(screen.getByRole('button', { name: '09:00 Colosseum guided tour' })).toBeTruthy();
    expect(text(screen.getByTestId('revision'))).toBe('Revision 7');
    expect(text(screen.getByTestId('drafts'))).toBe('All changes published');
    expect(
      (screen.getByRole('button', { name: 'Publish changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('selecting another day swaps the timeline', () => {
    render(<Harness day="2026-12-31" />);
    fireEvent.click(screen.getByRole('button', { name: /Day 5 · Concert/ }));
    expect(
      screen.getByRole('button', { name: '17:40 DEMO 086 arrives (late joiners)' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '09:00 Colosseum guided tour' })).toBeNull();
  });

  it('editing a selected event creates a draft; publishing bumps the revision', () => {
    render(<Harness day="2026-12-31" />);
    fireEvent.click(screen.getByRole('button', { name: '09:00 Colosseum guided tour' }));
    const title = screen.getByLabelText('Title') as HTMLInputElement;
    expect(title.value).toBe('Colosseum guided tour');
    fireEvent.change(title, { target: { value: 'Colosseum guided tour (early slot)' } });
    expect(text(screen.getByTestId('drafts'))).toBe('1 unpublished change');
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    const publish = screen.getByRole('button', { name: 'Publish changes' }) as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);
    expect(text(screen.getByTestId('revision'))).toBe('Revision 8');
    expect(text(screen.getByTestId('drafts'))).toBe('All changes published');
  });

  it('move down reorders within the day', () => {
    render(<Harness day="2026-12-31" />);
    fireEvent.click(screen.getByRole('button', { name: 'Move down: Breakfast' }));
    const rows = screen.getAllByRole('listitem').filter((li) => li.className.includes('tlrow'));
    expect(text(rows[0] ?? null)).toContain('Meet in the hotel lobby');
    expect(text(rows[1] ?? null)).toContain('Breakfast');
  });

  it('empty and error states', () => {
    render(
      <ItineraryView state={{ kind: 'error', correlationId: 'corr-it', retry: () => undefined }} />,
    );
    expect(text(screen.getByRole('alert'))).toContain('corr-it');
  });
});
