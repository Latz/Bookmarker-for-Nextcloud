export default function log(DEBUG,...args) {
  if (DEBUG) {
    console.log(...args);
  }
}
