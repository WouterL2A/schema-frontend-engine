// src/schemaRegistry.js
// Registry for hierarchical Draft-07 schemas + grouping metadata (x-ui)
// Best practice: app-level groups in app.schema.json, with per-entity fallback.

import app from './schemas/app.schema.json';
import auth from './schemas/auth.schema.json';
import crm from './schemas/crm.schema.json';
import forms from './schemas/form.schema.json';
import process from './schemas/process.schema.json';

// Merge all module definitions into a flat map: key -> schema
export const modules = { auth, crm, forms, process };

export const allDefinitions = Object.fromEntries(
  Object.values(modules).flatMap((m) => Object.entries(m.definitions || {}))
);

// Helpers
const pretty = (k) => (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ') : '');

// App-level groups from x-ui (preferred)
export function groupsFromApp() {
  const gx = app?.['x-ui']?.groups;
  if (!Array.isArray(gx) || gx.length === 0) return null;
  // Filter out unknown entities; sort by order
  const cleaned = gx.map((g) => ({
    id: g.id,
    label: g.label || pretty(g.id),
    order: g.order ?? 0,
    entities: (g.entities || []).filter((e) => e in allDefinitions),
  })).filter((g) => g.entities.length > 0);
  return cleaned.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// Fallback: derive from per-entity x-ui.group, else name heuristics
export function groupsFromEntities() {
  const buckets = {};
  for (const [key, def] of Object.entries(allDefinitions)) {
    const grp =
      def?.['x-ui']?.group ||
      (key.startsWith('process_') ? 'workflow' :
       key.includes('form') ? 'forms' :
       key === 'document_upload' || key.startsWith('legal_entity') ? 'crm' :
       'data');
    (buckets[grp] ||= []).push(key);
  }
  const out = Object.entries(buckets).map(([id, entities]) => ({
    id,
    label: pretty(id),
    order: id === 'workflow' ? 10 : id === 'auth' ? 20 : id === 'forms' ? 30 : id === 'crm' ? 40 : 50,
    entities: entities.sort(),
  }));
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getGroups() {
  return groupsFromApp() || groupsFromEntities();
}

export function entityTitle(entityKey) {
  return allDefinitions?.[entityKey]?.title || pretty(entityKey);
}
