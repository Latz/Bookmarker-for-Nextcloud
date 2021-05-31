export default async function getMeta(activeTab, content, ...metaNames) {
  const dom = new DOMParser().parseFromString(content, 'text/html');

  for (let metaName of metaNames) {
    let meta = dom.querySelector(`[${metaName.type}='${metaName.id}' i]`)?.content;
    if (meta) return meta;
  }

  return ''; // no description found
}
