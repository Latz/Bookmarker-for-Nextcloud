// export default async function getMeta(activeTab, content, metaName) {
//   const dom = new DOMParser().parseFromString(content, 'text/html');
//   let metas = dom.querySelectorAll('meta');
//   const meta = dom.querySelector(`[name=${metaName} i] `)?.content;
//   return meta;
// }

export default async function getMeta(activeTab, content, ...metaNames) {
  const dom = new DOMParser().parseFromString(content, 'text/html');
  let metas = dom.querySelectorAll('meta');
  metaNames.forEach((metaName) => {
    let meta = dom.querySelector(`[name='${metaName}' i]`)?.content;
    console.log('meta :>> ', meta);
    if (meta) return meta;
  });
  return ''; // no description found
}
