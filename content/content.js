browser.runtime.onMessage.addListener(async function (request) {
  let data = document.documentElement.innerHTML;
  return data;
});
