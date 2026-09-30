# ai-pricing-check

Reads the providers' price pages and compares the model prices with the list in
`src/lib/aiPricing.js`, which the options page (AI tab) uses to estimate what the
AI calls cost.

```
npm run check:prices                 # report only
npm run check:prices -- --write      # write changed and new prices into aiPricing.js
npm run check:prices -- --write --force   # also write changes of more than 10x
npm run check:prices -- --source anthropic --source openai
npm run check:prices -- -v --json prices.json
```

Exit code 1 if a source could not be read.

## Sources

| Source | What is read | Used for |
| --- | --- | --- |
| Anthropic | price table of the pricing docs | official prices |
| OpenAI | first ("Standard") table of the pricing docs | official prices |
| Google | "Paid Tier" input/output rows per model on the Gemini pricing page (requested in English) | official prices |
| DeepSeek | pricing table, **PEAK** cache-miss input and output price | official prices |
| OpenRouter | `/api/v1/models` (OpenAI, Anthropic, Google models only) | cross-check, and a fallback for models already in the list |

**Not readable:** Mistral's and Groq's price pages are rendered by JavaScript and
contain no prices in the HTML. `mistral-*` and `llama-*` keep their hand-entered
prices and show up as "In the list but on no page". OpenRouter is not used for
them: for models from other hosts it shows the cheapest host's price, not the
provider's own.

## What the report means

- **Changed prices** / **New models** -- written by `--write`. A change of more
  than 10x is marked `SUSPICIOUS` (more likely a misread page) and only written
  with `--force`.
- **Official page and OpenRouter disagree** -- the page wins; look at it by hand.
- **In the list but on no page** -- never removed automatically.
- Models priced per image/audio/second (image, tts, live, ...) are skipped.

Like the keyword checker, this is a hint, not a verdict: the pages change their
layout without notice. If a source suddenly reports "no prices found", its
extractor in `extractors.js` needs a look. `node dump.js <dir> <url> ...` saves
the text and tables a page really yields, to write or fix an extractor against.

The extractors and the comparison are covered by `tests/tools/pricingCheck.test.js`.
