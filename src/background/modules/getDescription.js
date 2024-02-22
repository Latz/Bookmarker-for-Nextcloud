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
    { type: 'http-equiv', id: 'description' }
  );
  if (description.length === 0) return '';

  description = description[0].replace(/(^\n+)|(\n+$)/g, ''); // trim "\n" from start and end
  return description.trim(); // Remove leading and trailing blanks
}
