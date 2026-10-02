// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { HINTS, HINTS_AS_OF } from '../../src/lib/aiHints.js';
import { AI_PROVIDERS } from '../../src/lib/aiProviders.js';

const locale = (lang) =>
  JSON.parse(readFileSync(`public/_locales/${lang}/messages.json`, 'utf8'));

describe('aiHints', () => {
  it('has the month it was checked against the price pages', () => {
    expect(HINTS_AS_OF).toMatch(/^\d{4}-\d{2}$/);
  });

  it('has one hint per provider, for providers that exist', () => {
    const known = AI_PROVIDERS.map((p) => p.id);
    for (const hint of HINTS) expect(known).toContain(hint.id);
    expect(new Set(HINTS.map((h) => h.id)).size).toBe(HINTS.length);
    // every provider with a price has a hint (a custom server has none to give)
    for (const id of known.filter((id) => id !== 'custom')) {
      expect(HINTS.map((h) => h.id)).toContain(id);
    }
  });

  it('links only to https pages', () => {
    for (const hint of HINTS.filter((h) => h.pricingUrl)) {
      expect(new URL(hint.pricingUrl).protocol).toBe('https:');
    }
  });

  it.each(['en', 'de'])('has a text for every hint in %s', (lang) => {
    const messages = locale(lang);
    for (const hint of HINTS) {
      expect(messages[`aiHint_${hint.id}`]?.message).toBeTruthy();
    }
    expect(messages.aiHintsTitle.message).toBeTruthy();
    expect(messages.aiHintsPrices.message).toBeTruthy();
    expect(messages.aiHintsNote.message).toContain('$date$');
  });

  it('does not name prices or single models: the texts speak of families', () => {
    for (const lang of ['en', 'de']) {
      const messages = locale(lang);
      for (const hint of HINTS) {
        expect(messages[`aiHint_${hint.id}`].message).not.toMatch(/\$\d/);
      }
    }
  });
});
