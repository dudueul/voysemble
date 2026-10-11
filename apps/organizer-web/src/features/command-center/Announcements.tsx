// Copyright 2026- At Day. All rights reserved.
// Announcement acknowledgment summary (n/total). Full = green + bold; still textual.

import { Icons } from '../../app/shell/icons';
import type { Announcement } from '../../fixtures/korea-concert-tour';
import { strings } from '../../lib/strings';

export function Announcements({ items }: { items: Announcement[] }) {
  return (
    <section className="card" aria-labelledby="an-title">
      <div className="card__head">
        <h2 className="card__title" id="an-title">
          {strings.dashboard.announcements}
        </h2>
        <button type="button" className="link">
          {strings.dashboard.viewAll}
          <Icons.arrow width="16" height="16" />
        </button>
      </div>
      <div className="card__body">
        {items.length === 0 ? (
          <p className="state__body">{strings.dashboard.noAnnouncements}</p>
        ) : null}
        {items.map((a) => {
          const full = a.acknowledged >= a.total;
          return (
            <div key={a.id} className="ann">
              <span className="ann__title">{a.title}</span>
              <span className={`ann__ack ${full ? 'ann__ack--full' : ''}`}>
                {a.acknowledged}/{a.total}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
