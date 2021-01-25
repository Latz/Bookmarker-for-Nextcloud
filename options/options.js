import { load_data, store_data, delete_data } from '../lib/storage.js';

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    const myTabs = Tabby.init();

    const general_options = document.getElementById('general_options');
    const cbx_zenMode = document.getElementById('cbx_zenMode');
    const cbx_magicMode = document.getElementById('cbx_magicMode');

    // set initial state of elements
    let settings = await load_data('options', 'zenMode', 'magicMode');
    cbx_folderSelect.checked = settings.folderSelect;

    general_options.addEventListener('click', (event) => {
      // event.preventDefault();
      switch (event.target) {
        case cbx_zenMode:
          store_data('options', { zenMode: cbx_zenMode.checked });
          break;
        case cbx_magicMode:
          store_data('options', { magicMode: cbx_magicMode.checked });
          break;
          magic;
      }
    });
  }
};
// -------------------------------------------------------------------------
