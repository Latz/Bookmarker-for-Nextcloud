# ai-pricing-check

Reads the providers' price pages **the way the extension does** and prints what
they say. The extension has **no built-in prices**: they are read from the
providers' own pages when the user presses the update button in the AI tab (and
weekly), saved in `chrome.storage.local` (`aiData`) and used for the
cheapest-models box, the prices in the model dropdowns, the cost statistics and
the automatic switch. This tool runs the same code, to see what the extension
will read and to find out which page changed its layout. It changes nothing.

```
npm run check:prices                       # which pages are readable, how many models
npm run check:prices -- -v                 # every model with its price
npm run check:prices -- --source mistral   # only some sources
npm run check:prices -- --json prices.json
```

Exit code 1 if a source could not be read.

The code is shared: the extractors, the list of pages, `readSource` and the
comparison live in `src/lib/` (`aiPriceExtractors.js`, `aiPriceSources.js`,
`aiPriceMerge.js`); this tool only adds fetching with Node and jsdom for the
HTML. In the extension the pages are fetched and parsed in the offscreen
document (`src/background/modules/ai/priceUpdate.js`). A page that changes its
layout breaks the tool and the extension alike.

## Sources

| Source | What is read | Used for |
| --- | --- | --- |
| Anthropic | price table of the pricing docs (+ cache hit price) | official prices |
| OpenAI | first ("Standard") table of the pricing docs (+ cached input) | official prices |
| Google | "Paid Tier" input/output rows per model on the Gemini pricing page (requested in English) | official prices |
| DeepSeek | pricing table, **PEAK** cache-miss input and output price; context window, largest answer, a description made of its "model version" and "thinking mode" rows; the legacy names its footnote says are still accepted get the same price and details | official prices |
| Groq | models table of `console.groq.com/docs/models` (model id from the `id` attribute, price "$x input$y output"; speed, context window, largest answer) | official prices |
| Mistral | the tables of `docs.mistral.ai/inference/pricing` (current chat models; named by size: `mistral-large`, `ministral-14b`, `codestral`, ...; plus cached input) | official prices |
| OpenRouter | `/api/v1/models` (OpenAI, Anthropic, Google models; for Mistral only the newest model of each size stands for `mistral-large` / `-medium` / `-small`) | details (description, context window, release date, input types), cross-check, and the models the official pages do not list (the OpenAI page only names the newest ones) |

An official page overrides OpenRouter where both know a price or a detail.

**Limits:**

- **Mistral:** `mistral.ai/pricing` has no prices in its HTML, but the pricing page
  of the docs does. Voxtral, OCR, embeddings and per-page or per-minute prices are
  not tracked.
- **Groq:** the Llama models say "Contact Sales" (no public price), so they have
  no price. Models priced per hour or per character (Whisper, text-to-speech) are
  skipped.
- **OpenRouter** shows, for models from other hosts, the cheapest host's price, so
  it is used only for the vendors it passes the list price through for (OpenAI,
  Anthropic, Google, Mistral's sizes).
- Models priced per image/audio/second (image, tts, live, ...) are skipped.

## What the extension does with it

New and changed prices of the official sources and the models only OpenRouter
lists are taken; a change of more than 10x is not (more likely a misread page)
and is reported. Nothing is ever removed, and a source that fails leaves its
models as they are.

`node dump.js <dir> <url> ...` saves the text and the tables a page really yields,
to write or fix an extractor against.

The extractors and the comparison are covered by `tests/tools/pricingCheck.test.js`
and `tests/lib/aiPriceSources.test.js`.
