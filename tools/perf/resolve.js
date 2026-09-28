// Finds extension modules in either source layout, so the same benchmark can
// run against the flat layout (src/background/modules/x.js, before the
// bookmarks/ browser/ page/ refactoring) and the grouped one.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Grouped layout first; '' is the flat layout (and startup.js in both).
const SUBDIRS = ['page', 'bookmarks', 'browser', ''];

/**
 * @param {string} root - Repository (or worktree) root.
 * @param {string} name - Module path below modules/ without extension, e.g.
 *   'extractPageData' or 'keywords/pageSources'.
 * @returns {string} file:// URL
 */
export function moduleUrl(root, name) {
  const base = join(root, 'src', 'background', 'modules');
  for (const sub of SUBDIRS) {
    const path = join(base, sub, `${name}.js`);
    if (existsSync(path)) return pathToFileURL(path).href;
  }
  throw new Error(`module "${name}" not found under ${root}`);
}

/** @returns {string} file:// URL of src/lib/<name>.js */
export function libUrl(root, name) {
  const path = join(root, 'src', 'lib', `${name}.js`);
  if (!existsSync(path)) throw new Error(`lib "${name}" not found under ${root}`);
  return pathToFileURL(path).href;
}
