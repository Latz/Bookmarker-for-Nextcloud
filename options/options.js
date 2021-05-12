import { load_data, load_data_all, store_data, delete_data } from '../lib/storage.js';

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    const myTabs = Tabby.init();

    const options = document.getElementById('options');

    // set initial state of elements
    let optionsData = await load_data_all('options');
    optionsData.forEach((option) => {
      if (option.item.startsWith('cbx')) document.getElementById(option.item).checked = option.value;
    });

    // get name of all inputs
    const inputs = document.getElementsByTagName('input');

    options.addEventListener('click', (event) => {
      // event.preventDefault();
      console.log('click');
      const inputs = ['checkbox'];
      if (inputs.includes(event.target.type)) {
        let data = JSON.parse(`{"${event.target.id}":${event.target.checked}}`);
        store_data('options', data);
      }
    });
  }
};
// -------------------------------------------------------------------------
