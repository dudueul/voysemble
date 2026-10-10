// Copyright 2026- At Day. All rights reserved.
// Honest placeholder for sections not built yet (feature-status: deferred). Never fakes content.

import { Icons } from '../../app/shell/icons';
import { strings } from '../../lib/strings';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="page">
      <h1 className="page__title">{title}</h1>
      <section className="card">
        <div className="state" role="status">
          <span className="state__icon">
            <Icons.checklist />
          </span>
          <h2 className="state__title">{strings.placeholder.title(title)}</h2>
          <p className="state__body">{strings.placeholder.body}</p>
        </div>
      </section>
    </main>
  );
}
