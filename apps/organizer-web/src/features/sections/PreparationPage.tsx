// Copyright 2026- At Day. All rights reserved.
// Preparation: documents & forms (gallery #28/#18, D27) and the packing checklist. Document
// counts are per requirement; the scans themselves are organizer-only, reauth-gated, and never
// listed here.

import { Icons } from '../../app/shell/icons';
import { documents, packingChecklist } from '../../fixtures/sections';
import { strings } from '../../lib/strings';
import { Card, Meter, SectionPage } from './SectionPage';

const s = strings.preparation;

export function PreparationPage() {
  const missing = documents
    .filter((d) => d.required)
    .reduce((n, d) => n + (d.total - d.collected), 0);
  return (
    <SectionPage
      title={strings.nav.preparation}
      subtitle={s.subtitle(missing)}
      actions={
        <button type="button" className="btn btn--primary btn--sm">
          <Icons.plus /> {s.addRequirement}
        </button>
      }
    >
      <div className="grid">
        <Card title={s.documents} id="prep-docs">
          <table className="table" data-testid="doc-table">
            <thead>
              <tr>
                <th>{s.colDocument}</th>
                <th>{s.colRequired}</th>
                <th>{s.colCollected}</th>
                <th>{s.colDue}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => {
                const done = d.collected === d.total;
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.name}</strong>
                    </td>
                    <td>{d.required ? s.required : s.optional}</td>
                    <td>
                      <div className="cellmeter">
                        <Meter
                          value={d.collected}
                          max={d.total}
                          tone={done ? 'ok' : d.required ? 'warn' : 'brand'}
                          label={s.collected(d.collected, d.total)}
                        />
                        <span className="small" data-testid={`doc-${d.id}`}>
                          {d.collected}/{d.total}
                        </span>
                      </div>
                    </td>
                    <td className="muted">{d.dueOn}</td>
                    <td>
                      {done ? (
                        <span className="chip chip--done">{s.complete}</span>
                      ) : (
                        <button type="button" className="linkbtn">
                          {s.remind(d.total - d.collected)}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">{s.scanRule}</p>
        </Card>
        <Card title={s.packing} id="prep-packing">
          <ul className="list list--plain checklist" data-testid="packing">
            {packingChecklist.map((p) => (
              <li key={p.item} className={p.done ? 'checklist__done' : ''}>
                <span className={`check ${p.done ? 'check--on' : ''}`} aria-hidden="true">
                  {p.done ? <Icons.check /> : null}
                </span>
                {p.item}
              </li>
            ))}
          </ul>
          <p className="muted small">{s.packingNote}</p>
        </Card>
      </div>
    </SectionPage>
  );
}
