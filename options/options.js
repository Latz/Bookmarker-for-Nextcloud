import { load_data, store_data, delete_data } from '../lib/storage.js';

document.onreadystatechange = async () => {
  if (document.readyState === 'complete') {
    const myTabs = Tabby.init();

    const general_options = document.getElementById('general_options');
    const cbx_zenMode = document.getElementById('cbx_zenMode');
    const cbx_displayFolders = document.getElementById('cbx_displayFolders');
    const cbx_magicMode = document.getElementById('cbx_magicMode');

    // set initial state of elements
    let settings = await load_data('options', 'zenMode', 'displayFolders', 'magicMode');
    cbx_displayFolders.checked = settings.displayFolders;
    cbx_zenMode.checked = settings.zenMode;
    cbx_magicMode.checked = settings.magicMode;

    general_options.addEventListener('click', (event) => {
      // event.preventDefault();
      switch (event.target) {
        case cbx_zenMode:
          store_data('options', { zenMode: cbx_zenMode.checked });
          break;
        case cbx_displayFolders:
          store_data('options', { displayFolders: cbx_displayFolders.checked });
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
