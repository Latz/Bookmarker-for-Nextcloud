// @ts-check
/**
 * Reads the text the AI needs from the live page: the visible main text
 * (capped) and the first headings.
 *
 * Like extractPageData this is injected into the tab with
 * chrome.scripting.executeScript, so it must be self-contained (no imports,
 * no module-scope bindings) and return plain data.
 *
 * @param {number} maxChars - Upper bound for the returned text.
 * @returns {{headings: string[], text: string} | {error: string}}
 */
export function extractPageText(maxChars) {
  try {
    const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const root =
      document.querySelector('article') ??
      document.querySelector('main, [role="main"]') ??
      document.body;
    // innerText leaves out hidden elements, scripts and styles; textContent
    // is the fallback for engines/DOMs without layout.
    const raw = root?.innerText ?? root?.textContent ?? '';
    const headings = Array.from(document.querySelectorAll('h1, h2'))
      .map((heading) => clean(heading.textContent))
      .filter(Boolean)
      .slice(0, 10);
    return { headings, text: clean(raw).slice(0, maxChars) };
  } catch (error) {
    return { error: error.message };
  }
}
