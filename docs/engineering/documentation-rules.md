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
