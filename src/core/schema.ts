// Utilities related to form-js schemas

// Build a map of components by "key" (recursively)
export function indexByKey(components: any[], map: Map<string, any> = new Map()) {
  for (const c of components || []) {
    if (!c) continue;
    if (c?.key) map.set(c.key, c);
    if (Array.isArray(c?.components)) indexByKey(c.components, map);
  }
  return map;
}

// Extract input field keys for UI (skips pure display like 'text', 'button')
export function extractFieldKeys(components: any[] = [], acc: string[] = []): string[] {
  for (const c of components) {
    if (!c) continue;
    if (c.type === 'text' || c.type === 'button') {
      if (Array.isArray(c.components)) extractFieldKeys(c.components, acc);
      continue;
    }
    if (c.key && typeof c.key === 'string') acc.push(c.key);
    if (Array.isArray(c.components)) extractFieldKeys(c.components, acc);
  }
  return acc;
}
