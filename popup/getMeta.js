export default async function getMeta(activeTab, content, metaName) {
  const dom = new DOMParser().parseFromString(content, 'text/html');
  let metas = dom.querySelectorAll('meta');
  const meta = dom.querySelector(`[name=${metaName} i] `)?.content;
  return meta;
}
