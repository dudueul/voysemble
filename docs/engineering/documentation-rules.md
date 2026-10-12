# Documentation rules

Founder directive: document details everywhere.

1. Every decision -> ADR in `docs/decisions/` + one row in `docs/planning/decision-log.md`.
2. Every package/app -> `README.md`: purpose, public surface, how to run, how to test, owners.
3. Every module file -> header comment: what it owns, what it must not do, invariants.
4. Every public function/capability -> doc comment: inputs, outputs, errors (tagged), side effects.
5. Every table/migration -> comment per column with sensitivity tier (1 ops, 2 PII, 3 document).
6. Every invariant from the specs -> a test whose name states the invariant.
7. Every runbook -> `docs/runbooks/`: preconditions, exact commands, rollback, evidence to keep.
8. Every deviation from the reference docs -> ADR with "Supersedes" line.
9. `feature-status.json` is updated in the same commit as the feature.
10. Source header on every file: `Copyright 2026- At Day. All rights reserved.`
11. Device captures every slice (D31): a slice that touches a client records the designed views
    for each device class it affects, as tests that write PNGs: web console and public site at
    desktop-1440, laptop-1280, tablet-1024, phone-390 (Playwright, `docs/captures/web/`,
    `docs/captures/public/`); Android at 412x915 light and dark (Roborazzi,
    `docs/captures/android/`); iOS at 393x852 (XCTest `CaptureTests`, `docs/captures/ios/`).
    CI's `captures` job commits them back to the branch (`[skip ci]`), so pull before pushing and
    never stage capture PNGs from a workstation (`git add -A -- . ':!docs/captures/**/*.png'`); local
    runs only preview. The slice entry links the captures.
