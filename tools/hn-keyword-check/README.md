# hn-keyword-check

Loads the Hacker News front page, fetches every linked page, and compares an
independent keyword/tag/description detector (`reference.js`) against the
extension's own pipeline (`extractPageData` → `createMockDocument` →
`getDescription` / `getKeywords` from `../../src`).

```sh
node tools/hn-keyword-check/check.js              # all front-page stories
node tools/hn-keyword-check/check.js --limit 10
node tools/hn-keyword-check/check.js --url <url>  # one page (repeatable)
node tools/hn-keyword-check/check.js --verbose --json results.json
```

Pages are parsed with happy-dom (scripts disabled), so client-rendered
metadata is not seen. `src/lib/storage.js` and `src/lib/cache.js` are swapped
for stubs (`stubs.js`), so keywords are reported unreduced (`cbx_reduceKeywords`
off) and extended keywords are disabled.

| Status      | Meaning                                                            |
| ----------- | ------------------------------------------------------------------ |
| `ok`        | Everything the reference found, the extension found too           |
| `none`      | Page has no keywords or description                                |
| `MISS-KW`   | Reference found keywords, extension found none                     |
| `MISS-DESC` | Reference found a description, extension found none                |
| `partial`   | Both found keywords, but the reference has extra ones (often expected: `getKeywords` stops at the first source that returns anything) |
| `skipped` / `error` | Non-HTML response, HTTP error, or timeout                  |

Exits with code 1 if any page has a `MISS-*` status.
