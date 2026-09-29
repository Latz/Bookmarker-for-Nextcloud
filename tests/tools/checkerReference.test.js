// @vitest-environment happy-dom
/**
 * Unit tests for the independent detector of tools/hn-keyword-check
 */
import { describe, it, expect, afterEach } from 'vitest';
import { detectReference } from '../../tools/hn-keyword-check/reference.js';

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

const inline = () => detectReference(document).keywords['inline-script keywords'];

describe('detectReference: description metas', () => {
  it('reads a non-standard name="og:description" (jimmyhmiller.com)', () => {
    document.head.innerHTML =
      '<meta name="og:description" content="It’s time we stopped treating languages as sacred.">';

    expect(detectReference(document).descriptions['meta[name=og:description]']).toBe(
      "It’s time we stopped treating languages as sacred.",
    );
  });

  it('reads http-equiv="description"', () => {
    document.head.innerHTML =
      '<meta http-equiv="description" content="An old-style description.">';

    expect(
      detectReference(document).descriptions['meta[http-equiv=description]'],
    ).toBe('An old-style description.');
  });

  it('has no description when none of the sources match', () => {
    document.head.innerHTML = '<meta name="author" content="Someone">';

    expect(detectReference(document).descriptions).toEqual({});
  });
});

describe('detectReference: inline script keywords', () => {
  it('reads a comma-separated string under a quoted key', () => {
    document.body.innerHTML =
      '<script>var c = {"keywords":"UK news, Military,Police"};</script>';

    expect(inline()).toEqual(['UK news', 'Military', 'Police']);
  });

  it('splits pipe-separated strings', () => {
    document.body.innerHTML =
      '<script>x({"content":{"keywords":"NASA|space"}})</script>';

    expect(inline()).toEqual(['NASA', 'space']);
  });

  it('reads a JSON array', () => {
    document.body.innerHTML =
      '<script>var c = {"keywords":["Hulu","Kid Detective"]};</script>';

    expect(inline()).toEqual(['Hulu', 'Kid Detective']);
  });

  it('skips empty and null values', () => {
    document.body.innerHTML =
      '<script>var c = {"keywords":"","keywords":[],"keywords":null,"keywords":"real"};</script>';

    expect(inline()).toEqual(['real']);
  });

  it('is only a fallback: ignored when a real source has keywords', () => {
    document.head.innerHTML = '<meta name="keywords" content="a, b">';
    document.body.innerHTML = '<script>var c = {"keywords":"noise"};</script>';

    const { keywords } = detectReference(document);

    expect(keywords['meta[name=keywords]']).toEqual(['a', 'b']);
    expect(keywords['inline-script keywords']).toBeUndefined();
  });

  it('does not read JSON-LD blocks as inline scripts', () => {
    document.body.innerHTML =
      '<script type="application/ld+json">{"keywords":["ld"]}</script>';

    const { keywords } = detectReference(document);

    expect(keywords['json-ld keywords']).toEqual(['ld']);
    expect(keywords['inline-script keywords']).toBeUndefined();
  });
});

describe('detectReference: tag link hints', () => {
  it('reports same-site /tag/, /tags/, /topic/ and /t/ links as hints, not keywords', () => {
    document.body.innerHTML = `
      <a href="/tag/agents/">agents</a>
      <a href="/tags/ai">AI</a>
      <a href="/topics/rust">Rust</a>
      <a href="/t/hulu/">Hulu</a>
      <a href="/tag/agents/">agents</a>
      <a href="/about">About</a>
      <a href="/tag/a/b">nested</a>`;

    const result = detectReference(document);

    expect(result.hints['tag links']).toEqual(['agents', 'AI', 'Rust', 'Hulu']);
    expect(result.keywords).toEqual({});
  });

  it('reports /tags/{id}/{slug} links too (NPR)', () => {
    document.body.innerHTML = `
      <a class="tag tag--story" href="/tags/133775819/artificial-intelligence">Artificial Intelligence</a>
      <a class="tag tag--story" href="/tags/479274800/ai">AI</a>`;

    expect(detectReference(document).hints['tag links']).toEqual([
      'Artificial Intelligence',
      'AI',
    ]);
  });

  it('does not treat a non-numeric middle segment as a tag link (category hierarchy)', () => {
    document.body.innerHTML = '<a href="/tags/electronics/phones">Phones</a>';

    expect(detectReference(document).hints).toEqual({});
  });

  it('falls back to the URL slug when the link text is a whole card, not a tag label (hackeratlas.com)', () => {
    document.body.innerHTML = `
      <a href="/topic/ai-governance-and-societal-impacts/">AI governance and societal impactsAI safety, governance, regulation, rights, trust, employment, and societal consequences.1,366 posts · last 30 days1.</a>
      <a href="/topic/apple-ecosystem/">Apple ecosystemApple Macs, iPhones, iOS, macOS, Apple Silicon, the App Store, and Apple business and policy.472 posts</a>`;

    expect(detectReference(document).hints['tag links']).toEqual([
      'ai governance and societal impacts',
      'apple ecosystem',
    ]);
  });

  it('strips a file extension from the slug fallback', () => {
    document.body.innerHTML = `<a href="/tags/ai.html">${'x'.repeat(61)}</a>`;

    expect(detectReference(document).hints['tag links']).toEqual(['ai']);
  });

  it('keeps a short tag label as-is, even from a card-shaped link', () => {
    document.body.innerHTML = '<a href="/tags/ai.html">AI</a>';

    expect(detectReference(document).hints['tag links']).toEqual(['AI']);
  });

  it('ignores tag links to other sites and empty link texts', () => {
    document.body.innerHTML = `
      <a href="https://other.example/tag/x/">external</a>
      <a href="/tag/blank/"> </a>`;

    expect(detectReference(document).hints).toEqual({});
  });

  it('has no hints on a page without tag links', () => {
    document.body.innerHTML = '<a href="/home">Home</a>';

    expect(detectReference(document).hints).toEqual({});
  });
});
