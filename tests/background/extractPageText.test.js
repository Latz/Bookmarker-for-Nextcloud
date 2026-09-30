// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { extractPageText } from '../../src/background/modules/page/extractPageText.js';

describe('extractPageText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers the article text and collects h1/h2 headings', () => {
    document.body.innerHTML = `
      <nav>Menu</nav>
      <h1>Main   title</h1>
      <article><h2>Sub</h2><p>The   article
      text.</p></article>
      <footer>Footer</footer>`;

    const result = extractPageText(1000);

    expect(result.headings).toEqual(['Main title', 'Sub']);
    expect(result.text).toContain('The article text.');
    expect(result.text).not.toContain('Menu');
    expect(result.text).not.toContain('Footer');
  });

  it('falls back to the body and caps the length', () => {
    document.body.innerHTML = `<p>${'abc '.repeat(1000)}</p>`;
    expect(extractPageText(50).text).toHaveLength(50);
  });
});
