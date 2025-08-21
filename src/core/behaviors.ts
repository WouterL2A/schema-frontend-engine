import { ActionContext, BehaviorBundle, BehaviorMatrixValue, FieldCell } from './types';

/**
 * Convert Behavior Matrix (UI) -> Behavior Bundles (engine/runtime)
 * - visible: mode !== 'hidden'
 * - required: checkbox
 * - action per state:
 *   - 'entry' => 'create'
 *   - else => 'update' if any cell is 'editable', otherwise 'view'
 */
export function bundlesFromMatrix(matrix: BehaviorMatrixValue, states: string[]): BehaviorBundle[] {
  const bundles: BehaviorBundle[] = [];

  for (const s of states) {
    let anyEditable = false;
    Object.keys(matrix).forEach((field) => {
      if (matrix[field][s]?.mode === 'editable') anyEditable = true;
    });

    const action: ActionContext = s === 'entry' ? 'create' : (anyEditable ? 'update' : 'view');

    const rows = Object.keys(matrix).map((field) => {
      const cell = matrix[field][s] || { mode: 'hidden', required: false };
      return {
        field_name: field,
        action_context: action,
        visible: cell.mode !== 'hidden',
        required: !!cell.required
      };
    });

    bundles.push({ state: s, action, rows });
  }

  return bundles;
}

/**
 * Convert Behavior Bundles -> Behavior Matrix (UI)
 */
export function matrixFromBundles(bundles: BehaviorBundle[]): BehaviorMatrixValue {
  const out: BehaviorMatrixValue = {};
  for (const b of bundles) {
    for (const row of b.rows) {
      out[row.field_name] = out[row.field_name] || {};
      const mode: FieldCell['mode'] =
        row.visible === false ? 'hidden' : (b.action === 'view' ? 'readonly' : 'editable');
      out[row.field_name][b.state] = { mode, required: !!row.required };
    }
  }
  return out;
}
