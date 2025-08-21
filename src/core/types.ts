// Shared types used across modules

export type ActionContext = 'view' | 'create' | 'update';

export interface TaskFieldBehavior {
  field_name: string;           // matches form-js component.key
  action_context: ActionContext; // view/create/update
  visible?: boolean;            // default true
  required?: boolean;           // default false
}

export interface BehaviorBundle {
  state: string;                // e.g., 'entry', 'review.section1', ...
  action: ActionContext;        // state-wide action
  rows: TaskFieldBehavior[];
}

// Behavior Matrix (UI) model
export type CellMode = 'hidden' | 'readonly' | 'editable';

export interface FieldCell {
  mode: CellMode;
  required: boolean;
}

export type BehaviorMatrixValue = Record<string, Record<string, FieldCell>>;
// shape: matrix[fieldKey][state] = { mode, required }
