// src/utils/refData.js
import api from '../api';

// Shared in-memory cache so widgets and lists reuse the same lookups
// Keyed by `${table}|${valueKey}|${labelKey}`
const _cache = new Map();

/** Guess a nice label field for a reference table */
export function guessLabelKey(allDefs, table) {
  const def = allDefs?.[table];
  const props = def?.properties || {};
  for (const k of ['name', 'email', 'title']) {
    if (props[k]) return k;
  }
  return 'id';
}

/** Fetch options for a ref table and cache them (value,label,raw) */
export async function getRefOptions(table, valueKey = 'id', labelKey = 'name') {
  const key = `${table}|${valueKey}|${labelKey}`;
  if (_cache.has(key)) return _cache.get(key);

//  const res = await api.get(`/${table}/`, { params: { limit: 1000, offset: 0 } });
  const res = await api.get(`/${table}/`, { params: { limit: 100, offset: 0 } });

  // Handle both {items:[...]} and bare arrays just in case
  const data = res?.data ?? res ?? {};
  const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);

  const options = items.map((it) => {
    const value = it?.[valueKey] ?? it?.id;
    const label =
      it?.[labelKey] ??
      it?.display ??
      it?.name ??
      it?.email ??
      String(value ?? '');
    return { value, label, raw: it };
  });

  const map = new Map(options.map((o) => [o.value, o.label]));

  // Return both `options` and `opts` for compatibility
  const payload = { options, opts: options, map, valueKey, labelKey };
  _cache.set(key, payload);
  return payload;
}

/** Convenience: get a label for a given id if cached */
export function getLabelFromCache(table, valueKey, labelKey, id) {
  const key = `${table}|${valueKey}|${labelKey}`;
  const cached = _cache.get(key);
  if (!cached) return undefined;
  return cached.map.get(id);
}

/** Expose cache so you can clear it if needed */
export const refCache = _cache;
