// Copyright 2026- At Day. All rights reserved.
// Head count per group with meters. The bar is decorative; the count text (n/total, "k missing")
// is the accessible content.

import type { HeadcountGroup } from '../../fixtures/korea-concert-tour';
import { strings } from '../../lib/strings';

export function HeadcountPanel({ groups }: { groups: HeadcountGroup[] }) {
  const checkedIn = groups.reduce((n, g) => n + g.checkedIn, 0);
  const expected = groups.reduce((n, g) => n + g.expected, 0);
  return (
    <section className="card" aria-labelledby="hc-title">
      <div className="card__head">
        <h2 className="card__title" id="hc-title">
          {strings.dashboard.headcount}
        </h2>
        <button type="button" className="btn btn--primary btn--sm">
          Open head count
        </button>
      </div>
      <div className="card__body headcount">
        {groups.length === 0 ? (
          <p className="state__body">{strings.dashboard.noHeadcounts}</p>
        ) : null}
        {groups.map((g) => {
          const pct = g.expected === 0 ? 0 : Math.round((g.checkedIn / g.expected) * 100);
          const short = g.checkedIn < g.expected;
          return (
            <div key={g.label} className="headcount__row">
              <span className="headcount__label">{g.label}</span>
              <div className="meter" aria-hidden="true">
                <div
                  className={`meter__fill ${short ? 'meter__fill--short' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="headcount__count" data-testid={`hc-${g.label}`}>
                {g.checkedIn}/{g.expected}
                {short ? <small> · {g.expected - g.checkedIn} missing</small> : null}
              </span>
            </div>
          );
        })}
        <div className="headcount__total">
          <strong data-testid="hc-total">
            {checkedIn}/{expected}
          </strong>
          <span className="stat__label">{strings.dashboard.checkedIn}</span>
        </div>
      </div>
    </section>
  );
}
