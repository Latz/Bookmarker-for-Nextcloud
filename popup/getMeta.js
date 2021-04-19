export default async function getMeta(activeTab, metaName) {
  const content = await browser.tabs.sendMessage(activeTab.id, 'getContent');
  const dom = new DOMParser().parseFromString(content, 'text/html');
  let metas = dom.querySelectorAll('meta');
  const meta = dom.querySelector(`[name=${metaName} i] `)?.content;
  return meta;
}
