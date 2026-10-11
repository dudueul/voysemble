# Data visualization palette and chart rules

Charts in the organizer console follow a fixed procedure: pick the form by the data's job,
assign color by job, validate the palette with a script, apply the mark specs, add hover, add a
table view. The console's first charts (Reports, Journey Graph) implement this in
`apps/organizer-web/src/features/sections/charts.tsx` and `JourneyGraphPage.tsx`.

## Palette (validated 2026-10-11)

Categorical, fixed order, used for itinerary event kinds in the journey graph. Assigned by
entity, never by rank; a seventh kind folds into "Other".

| Slot | Kind | Light | Dark |
|---|---|---|---|
| cat-1 | flight (also the single-series chart hue) | `#2563EB` | `#3B82F6` |
| cat-2 | meal | `#F59E0B` | `#D97706` |
| cat-3 | activity | `#0E9F8E` | `#0D9488` |
| cat-4 | hotel | `#F97316` | `#EA580C` |
| cat-5 | bus | `#7C3AED` | `#8B5CF6` |
| cat-6 | meeting | `#DB2777` | `#DB2777` |

Validator (dataviz skill, `scripts/validate_palette.js`), light surface: lightness band PASS,
chroma floor PASS, CVD separation PASS (worst adjacent ΔE 12.7 protan), normal-vision floor PASS
(worst 26.4), contrast WARN for `#F59E0B` and `#F97316` below 3:1. The warning is covered: every
node carries a text label and the legend names each kind. Dark surface: all five checks PASS.

Status colors (`--vy-success`, `--vy-warn`, `--vy-danger`) are reserved for state (meters, window
states, incident badges) and are never used as a series color.

## Mark rules in use

- Columns at most 24 px wide, 4 px rounded data-end, square at the baseline, 2 px surface gap.
- Lines 2 px with round joins; markers r = 5 with a 2 px surface ring; area wash at 10%.
- Gridlines 1 px solid in the border token; axis text in the muted text token.
- Values and labels never wear the series color.
- One series per chart, so no legend box; the card title names the series. The journey graph has
  six kinds and therefore a legend plus direct labels.
- Every chart has a hover tooltip (and keyboard focus per mark) and a `Table view` disclosure.
- Dark mode uses its own validated steps via `prefers-color-scheme`, not a flipped palette.
