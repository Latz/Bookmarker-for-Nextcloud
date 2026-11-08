import { vi } from 'vitest';

/**
 * In-memory chrome.storage area (get by key, key list or null; set; remove;
 * clear). storage.js keeps options and credentials here.
 */
export function createStorageArea() {
  const data = {};
  const pick = (keys) =>
    keys === null || keys === undefined
      ? { ...data }
      : Object.fromEntries(
          [keys]
            .flat()
            .filter((k) => k in data)
            .map((k) => [k, data[k]]),
        );
  return {
    data,
    get: vi.fn(async (keys) => structuredClone(pick(keys))),
    set: vi.fn(async (values) => {
      Object.assign(data, structuredClone(values));
    }),
    remove: vi.fn(async (keys) => {
      for (const k of [keys].flat()) delete data[k];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(data)) delete data[k];
    }),
  };
}
