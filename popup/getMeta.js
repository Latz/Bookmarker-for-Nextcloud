export default async function getMeta(activeTab, content, ...metaNames) {
  const dom = new DOMParser().parseFromString(content, 'text/html');
  for (let metaName of metaNames) {
  }
  let metas = [];
  for (let metaName of metaNames) {
    let metaNodelist = dom.querySelectorAll(`[${metaName.type}='${metaName.id}' i]`);
    console.log('metaName', metaName);
    console.log('metaNodelist :>> ', metaNodelist);
    if (metaNodelist.length > 0) {
      metaNodelist.forEach((meta) => metas.push(meta.content));
      return metas;
    }
  }
  return Array();
}
