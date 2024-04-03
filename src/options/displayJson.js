import { openDB } from 'idb';
import { load_data_all } from '../lib/storage';

const urlParams = window.location.search || '';
const type = urlParams.split('=')[1];
let data;
if (type === 'options') data = await load_data_all('options');
if (type === 'cache') {
  const db = await openDB('BookmarkerCache', 2);
  data = await db.get('keywords', 'keywords');
}
document.getElementById('jsondata').innerHTML =
  '<pre>' + JSON.stringify(data, null, 4) + '</pre>';
