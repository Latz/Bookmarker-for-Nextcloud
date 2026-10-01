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
| Groq | models table of `console.groq.com/docs/models` (model id from the `id` attribute, price "$x input$y output") | official prices |
| Mistral | the one price the FAQ of `mistral.ai/pricing` gives as an example ("Mistral Large costs $0.5 /M tokens in ...") | official price of that model |
| OpenRouter | `/api/v1/models` (OpenAI, Anthropic, Google models only) | cross-check, and a fallback for models already in the list |

**Limits:**

- **Mistral:** the price table of `mistral.ai/pricing` and the models pages of the
  docs are rendered by JavaScript and hold no prices in the HTML. Only the example
  sentence in the FAQ is read, so usually just one model (today Mistral Large);
  `mistral-small` and others keep their hand-entered prices. OpenRouter is not a
  substitute: for models from other hosts it shows the cheapest host's price.
- **Groq:** the Llama models say "Contact Sales" (no public price), so
  `llama-3.3-70b` keeps its old hand-entered price and is listed as "on no page".
  Models priced per hour or per character (Whisper, text-to-speech) are skipped.

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
