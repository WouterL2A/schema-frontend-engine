import { indexByKey } from './schema';
import { BehaviorBundle } from './types';

/**
 * Enrich a base form-js schema for the *current* state only.
 * - Applies FEEL conditional.hide using data.formState
 * - Applies validate.required per bundle rows
 * We re-run this on state/tab change, so we don't permanently mutate the authoring schema.
 */
export function enrichFormSchemaForState(schema: any, bundle: BehaviorBundle) {
  const cloned = JSON.parse(JSON.stringify(schema));
  const byKey = indexByKey(cloned.components || []);

  // reset to "hide unless this state" for all known fields
  byKey.forEach((cmp) => {
    cmp.conditional = cmp.conditional || {};
    cmp.conditional.hide = `= formState == "${bundle.state}" ? false : true`;
    if (cmp.validate && typeof cmp.validate.required !== 'undefined') {
      cmp.validate.required = false;
    }
  });

  // apply visibility/required for this state
  bundle.rows.forEach((row) => {
    const cmp = byKey.get(row.field_name);
    if (!cmp) return;

    // visibility for THIS state
    if (row.visible === false) {
      const prev = (cmp.conditional.hide as string | undefined)?.replace(/^=\s*/, '') || 'true';
      cmp.conditional.hide = `= formState == "${bundle.state}" ? true : (${prev})`;
    } else {
      cmp.conditional.hide = `= formState == "${bundle.state}" ? false : true`;
    }

    // required for THIS state
    if (row.required) {
      cmp.validate = cmp.validate || {};
      cmp.validate.required = true;
    }
  });

  return cloned;
}
