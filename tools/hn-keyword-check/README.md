# hn-keyword-check

Collects links from Hacker News (or other sources), fetches every linked page,
and compares an independent keyword/tag/description detector (`reference.js`)
against the extension's own pipeline (`extractPageData` → `createMockDocument`
→ `getDescription` / `getKeywords` from `../../src`).

```sh
npm run check:hn                                  # HN front page (default)
npm run check:hn -- --limit 10                    # flags go after --
npm run check:hn -- --source lobsters --source devto --pages 2
npm run check:hn -- --feed https://github.blog/feed/atom/
npm run check:hn -- --url <url>                   # one page (repeatable)
npm run check:hn -- --verbose --json results.json
npm run check:hn -- --source algolia --pages 3 --exclude results.json
```

| Option | Meaning |
| ------ | ------- |
| `--source <name>` | `hn` (default), `lobsters`, `devto` or `algolia` (HN stories via Algolia, far past the front page); repeatable |
| `--feed <url>` | Any RSS 2.0 / Atom feed; repeatable |
| `--pages N` | Pages to read per `--source` (default 1; ~30 links each) |
| `--url <url>` | Check exactly these pages, ignoring sources |
| `--exclude <file>` | Skip URLs already in an earlier `--json` result |
| `--limit N` | Check at most N pages (after removing duplicates) |
| `--json <file>` | Write the full per-page results |
| `--verbose` | Print keyword lists for every page, not only problems |

Reddit is not supported: it answers scripted requests with 403/429.

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
| `partial`   | Both found keywords, but the reference has extra ones           |
| `skipped` / `error` | Non-HTML response, HTTP error, or timeout                  |

Exits with code 1 if any page has a `MISS-*` status.

What the reference detector looks at: keyword meta tags, `rel="tag"` /
`rel="category"` links (also inside multi-token `rel` values) and JSON-LD
`keywords`. Only when none of those has keywords does it fall back to a
`keywords` property in inline scripts (`"keywords":"a,b"`, `["a","b"]`,
`a|b`), the same rule as the extension's brute-force search.

Links such as `/tag/agents/` or `/topics/ai/` are reported as a `hint:` line
for pages where the extension found no keywords. They are not counted as
keywords (they are often navigation or related topics), so they never cause a
`MISS-*` status.
