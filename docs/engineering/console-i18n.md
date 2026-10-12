# Console languages (slice 038)

The product supports Korean and English, nothing else (founder rule). The console was English-only
until this slice; it now speaks the account's language.

## Where the language comes from

1. The browser's stored choice (`localStorage` key `voysemble.locale`), set by the top-bar toggle.
2. The account's language from `GET /v1/me` (`accounts.locale`, set at the first magic-link request
   and changed by the toggle through `PATCH /v1/me`), used when the browser has no choice yet.
3. The browser language (`navigator.language` starting with `ko`), else English.

The toggle shows the other language in that language (`한국어` on an English console, `English` on a
Korean one), switches the console at once, stores the choice and saves it on the account so the next
sign-in from another browser starts in it. The sign-in page sends the same language with the
magic-link request so the email arrives in it.

## How the pages stay unchanged

`lib/strings.ts` exports `strings` with the shape the pages always imported, but as a view: every
property read resolves against the current table (`strings.en.ts`, `strings.ko.ts`). A page may keep
`const s = strings.people` at module level; `s.colName` still follows the language, because the view
returns nested views for objects and the leaf for text, functions and arrays. On a change the root
(`main.tsx`) remounts the router tree with `key={locale}` so every page re-reads, and
`document.documentElement.lang` follows.

Adding a string means adding it to both tables; the type `Strings` (from the English table) makes a
missing Korean key a compile error, and `strings.test.ts` checks the two tables have the same keys
with the same kinds of values and that no Korean leaf is still English (product names, the CSV
header and symbols excepted).

## Routes

| Route | Who | Behaviour |
|---|---|---|
| `PATCH /v1/me` | signed-in account | `{ locale: ko \| en }`; answers the `GET /v1/me` shape with the new language. |

## Facts established by tests

- Worker (`auth.test.ts`): the language changes and the next `/v1/me` reads it; an unknown language
  is 400; anonymous is 401.
- Console unit (`strings.test.ts`): key and kind parity of the two tables; the view resolves against
  the current language, also for a section held across the switch; the initial choice order.
- Browser (`locale.spec.ts`): the toggle, Korean navigation, persistence across a reload and on the
  account, the command center and People in Korean (captures `command-center-ko.png`,
  `people-ko.png`), Settings' form labels, and English back.

## Not done

Korean public-site parity for new sections; locale-aware dates (the console shows ISO dates and the
trip's clock as before). Korean on the phones: slice 039, `mobile-i18n.md`.
