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

## The same logic runs in the extension

The extractors, the list of pages and the comparison live in `src/lib/`
(`aiPriceExtractors.js`, `aiPriceSources.js`, `aiPriceMerge.js`); this tool only
adds fetching with Node (and jsdom for the HTML) and writing the source files.
The extension reads the same seven pages itself when you press the update button
in the AI tab (and weekly): the pages are fetched and parsed in the offscreen
document, new and changed prices and the details are saved in
`chrome.storage.local` (`aiData`) and used instead of the built-in ones. Running
this tool (`--write`) updates the **built-in** values, the starting point of a new
build. A page that changes its layout breaks the tool and the extension alike.

## Sources

| Source | What is read | Used for |
| --- | --- | --- |
| Anthropic | price table of the pricing docs | official prices |
| OpenAI | first ("Standard") table of the pricing docs | official prices |
| Google | "Paid Tier" input/output rows per model on the Gemini pricing page (requested in English) | official prices |
| DeepSeek | pricing table, **PEAK** cache-miss input and output price; context window, largest answer, a description made of its "model version" and "thinking mode" rows; the legacy names its footnote says are still accepted get the same price and details | official prices |
| Groq | models table of `console.groq.com/docs/models` (model id from the `id` attribute, price "$x input$y output") | official prices |
| Mistral | the tables of `docs.mistral.ai/inference/pricing` (current chat models; named by size: `mistral-large`, `ministral-14b`, `codestral`, ...; plus cached input) | official prices |
| OpenRouter | `/api/v1/models` (OpenAI, Anthropic, Google models; for Mistral only the newest model of each size stands for `mistral-large` / `-medium` / `-small`) | cross-check, details, and a fallback for models already in the list |

**Limits:**

- **Mistral:** `mistral.ai/pricing` has no prices in its HTML, but the pricing page
  of the docs does. The price list uses Mistral's size names (`mistral-small`, as
  `mistral-small-latest`), not the dated API ids. Other Mistral models (Voxtral,
  OCR, embeddings, per-page or per-minute prices) are not tracked.
- **Groq:** the Llama models say "Contact Sales" (no public price), so
  `llama-3.3-70b` keeps its old hand-entered price and is listed as "on no page".
  Models priced per hour or per character (Whisper, text-to-speech) are skipped.

## Model details

Besides the prices the tool collects details for the tooltip of the (i) icon in
the cheapest-models box on the options page, and writes them with `--write` to
`src/lib/aiModelInfo.js` (generated, do not edit): context window, largest
answer, release date, input types and a one-sentence description (OpenRouter's
model list, for OpenAI, Anthropic and Google models), cached-input price
(Anthropic and OpenAI price tables), context window and largest answer
(DeepSeek, with a description made of its table), speed, context window and
largest answer (Groq); Mistral's from OpenRouter's newest model of each size name (prices are the docs'). An
official page overrides OpenRouter where both know a detail. Only models of the
price list get details.

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
