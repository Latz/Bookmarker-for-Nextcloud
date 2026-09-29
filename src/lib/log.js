/**
 * Conditional console logger.
 *
 * Modules define a local `const DEBUG = false;` and pass it as the first
 * argument, so debug output can be switched on per module without touching
 * the call sites and stays silent in production.
 *
 * @param {boolean} DEBUG - Nothing is logged unless this is truthy.
 * @param {...any} args - Forwarded unchanged to `console.log`.
 */
export default function log(DEBUG, ...args) {
  if (DEBUG) {
    console.log(...args);
  }
}
