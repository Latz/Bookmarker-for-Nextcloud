export default class Spinner {
  constructor() {
    this.elements = ['|', '/', '-', '\\'];
    this.index = 0;
    this.intervalId = 0;
  }
  next = () => {
    this.index = (this.index + 1) % this.elements.length;
    return this.elements[0];
  };

  start = () => {
    chrome.action.setBadgeText({ text: '💾' });
  };
  stop = () => {
    chrome.action.setBadgeText({ text: '' });
  };
}
