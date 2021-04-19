chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
  let data = document.documentElement.innerHTML;
  return data;
});
