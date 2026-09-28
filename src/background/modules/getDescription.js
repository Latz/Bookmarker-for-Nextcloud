import getMeta from './getMeta.js';
// ------------------------------------------------------------------------------------------
export default function getDescription(document) {
  let description = getMeta(
    document,
    { type: 'property', id: 'og:description' },
    { type: 'name', id: 'description' },
    { type: 'name', id: 'twitter:description' },
    { type: 'content', id: 'og:description' },
    { type: 'name', id: 'og:description' },
    { type: 'rel', id: 'search' },
    { type: 'http-equiv', id: 'description' },
  );
  if (description.length === 0) return '';

  // trim() already strips "\n" along with other leading/trailing whitespace.
  return description[0].trim();
}
