# @voysemble/design-tokens

One `tokens.json` -> `dist/tokens.css` (web), `dist/Tokens.kt` (Compose), `dist/Tokens.swift`
(SwiftUI). Brand colors come from the retained brand kit (doc 01 §1.1). The deep operational
green is a proposed extension to match the approved mobile reference (doc 01 §18.2); status
colors are deliberately distinct from brand colors.

Semantic tokens exist for light and dark. Status must never be conveyed by color alone (text or
icon accompanies it).

```sh
pnpm --filter @voysemble/design-tokens build   # regenerate dist/
pnpm --filter @voysemble/design-tokens test
```
