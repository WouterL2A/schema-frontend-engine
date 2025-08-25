import React, { useEffect, useMemo, useState } from 'react';
import Form from '@rjsf/mui';
import { customizeValidator } from '@rjsf/validator-ajv8';
import api from '../api';
import schemaV2 from '../components/schema_v2.json';
import RefSelect from '../components/widgets/RefSelect';

import {
  Alert,
  AlertTitle,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from '@mui/material';

import { guessLabelKey } from '../utils/refData';

const validator = customizeValidator({
  ajvOptionsOverrides: { allErrors: true, strict: false },
  formats: {
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  }
});

// Hide the internal RJSF submit button (we use the dialog's Save)
const templates = { ButtonTemplates: { SubmitButton: () => null } };

function removeFromRequired(schemaObj, fields = []) {
  const clone = JSON.parse(JSON.stringify(schemaObj));
  if (Array.isArray(clone.required)) {
    clone.required = clone.required.filter((r) => !fields.includes(r));
  }
  return clone;
}

function buildInitialAuditValues(entitySchema) {
  const now = new Date().toISOString();
  const data = {};
  const props = entitySchema?.properties || {};
  if (props.created_at && props.created_at.type === 'string' && props.created_at.format === 'date-time') {
    data.created_at = now;
  }
  if (props.issued_at && props.issued_at.type === 'string' && props.issued_at.format === 'date-time') {
    data.issued_at = now;
  }
  return data;
}

function buildOrder(props) {
  if (!props) return undefined;
  const keys = Object.keys(props);
  const first = ['name', 'email', 'role', 'roles'];
  const last = ['created_at', 'issued_at', 'expires_at', 'updated_at', 'id'];
  const middle = keys.filter((k) => !first.includes(k) && !last.includes(k));
  return [...first.filter((k) => keys.includes(k)), ...middle, ...last.filter((k) => keys.includes(k))];
}

/** Build uiSchema: enums, widgets, FK dropdowns, audit field behavior */
function buildUiSchema(entitySchema, role, allDefs) {
  if (!entitySchema?.properties) return {};
  const ui = {};
  const props = entitySchema.properties;
  const toLabel = (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1);

  for (const [field, prop] of Object.entries(props)) {
    const xui = prop['x-ui'] || {};
    const entry = (ui[field] = ui[field] || {});

    // Hidden rules
    if (xui.hidden === true) {
      entry['ui:widget'] = 'hidden';
      continue;
    }
    if (Array.isArray(xui.visibleRoles) && !xui.visibleRoles.includes(role)) {
      entry['ui:widget'] = 'hidden';
      continue;
    }

    // FK detection (refTable/refColumn or $ref)
    if (prop.refTable || prop.$ref) {
      const table =
        prop.refTable ||
        (typeof prop.$ref === 'string' && prop.$ref.includes('#/definitions/')
          ? prop.$ref.split('#/definitions/')[1].split('/')[0]
          : undefined);

      if (table) {
        const valueKey = prop.refColumn || 'id';
        const labelKey = guessLabelKey(allDefs, table);
        entry['ui:widget'] = 'RefSelect';
        entry['ui:options'] = {
          ...(entry['ui:options'] || {}),
          ref: { table, value: valueKey, label: labelKey },
        };
      }
    }

    if (!entry['ui:widget']) {
      if (typeof xui.widget === 'string') {
        entry['ui:widget'] = xui.widget;
      } else if (/password/i.test(field)) {
        entry['ui:widget'] = 'password';
      }
    }

    if (xui.options && typeof xui.options === 'object') {
      entry['ui:options'] = { ...(entry['ui:options'] || {}), ...xui.options };
    }

    if (!entry['ui:widget']) {
      if (prop.type === 'array' && prop.items && Array.isArray(prop.items.enum)) {
        entry['ui:widget'] = 'checkboxes';
        entry['ui:options'] = {
          ...(entry['ui:options'] || {}),
          enumOptions: prop.items.enum.map((v) => ({ value: v, label: toLabel(v) })),
        };
      } else if (Array.isArray(prop.enum)) {
        entry['ui:widget'] = 'select';
        entry['ui:options'] = {
          ...(entry['ui:options'] || {}),
          enumOptions: prop.enum.map((v) => ({ value: v, label: toLabel(v) })),
        };
      }
    }
  }

  // Always hide 'id'
  if (props.id) {
    ui.id = { ...(ui.id || {}), 'ui:widget': 'hidden' };
  }

  // Audit fields visible but disabled
  ['created_at', 'issued_at', 'expires_at', 'updated_at'].forEach((k) => {
    if (props[k]) {
      ui[k] = { ...(ui[k] || {}), 'ui:disabled': true };
    }
  });

  const order = buildOrder(props);
  if (order) ui['ui:order'] = order;

  return ui;
}

const SchemaForm = ({ table, role, initialData, onSaved, open, onClose, mode = 'create' }) => {
  const [schema, setSchema] = useState({});
  const [formData, setFormData] = useState(initialData || {});
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFormData(initialData || {});
  }, [initialData, open]);

  useEffect(() => {
    if (!open) return;
    try {
      setLoading(true);
      setErrMsg('');

      const tableSchema = schemaV2?.definitions?.[table];
      if (!tableSchema) {
        throw new Error(`Table "${table}" not found in schema_v2.json definitions`);
      }

      const base = {
        $id: `urn:schema:schema_v2/${table}`,
        $schema: 'http://json-schema.org/draft-07/schema#',
        ...tableSchema,
        definitions: schemaV2.definitions,
      };

      const schemaForCreate = removeFromRequired(base, ['id']);
      setSchema(schemaForCreate);

      if (!initialData) {
        const initialAudit = buildInitialAuditValues(tableSchema);
        setFormData(initialAudit);
      }
    } catch (e) {
      console.error(e);
      setErrMsg('Failed to load local schema');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, open]);

  const uiSchema = useMemo(
    () => buildUiSchema(schema, role, schemaV2.definitions),
    [schema, role]
  );

  function stripSuppressedFields(data) {
    const cleaned = { ...data };
    if ('id' in cleaned) delete cleaned.id;
    return cleaned;
  }

  const onSubmit = ({ formData }) => {
    const payload = stripSuppressedFields(formData);
    const isEdit = mode === 'edit' && !!initialData?.id;
    const url = isEdit ? `/${table}/${initialData.id}` : `/${table}/`;
    const method = isEdit ? 'put' : 'post';

    api({ method, url, data: payload })
      .then((response) => {
        setFormData(response.data);
        onSaved && onSaved(response.data);
        onClose();
      })
      .catch((err) => {
        console.error(`Error saving ${table}:`, err);
        setErrMsg('Failed to submit form');
      });
  };

  const title =
    (mode === 'edit' ? 'Edit ' : 'Add ') +
    (table.charAt(0).toUpperCase() + table.slice(1).replace(/_/g, ' '));

  const formId = `form-${table}`;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {schema?.title || 'Fill out the form and save.'}
        </Typography>

        {!!errMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Error</AlertTitle>
            {errMsg}
          </Alert>
        )}

        {loading ? (
          <Typography>Loading schema...</Typography>
        ) : schema && schema.properties ? (
          <Form
            id={formId}
            key={table}
            schema={schema}
            uiSchema={uiSchema}
            formData={formData}
            validator={validator}
            templates={templates}
            widgets={{ RefSelect }}
            liveValidate
            showErrorList={false}
            onChange={({ formData }) => setFormData(formData)}
            onSubmit={onSubmit}
          />
        ) : (
          <Typography>No schema found for “{table}”.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form={formId} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SchemaForm;
