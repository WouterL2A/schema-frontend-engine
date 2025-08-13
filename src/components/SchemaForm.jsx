import React, { useEffect, useMemo, useState } from 'react';
import Form from '@rjsf/mui';
import { customizeValidator } from '@rjsf/validator-ajv8';
import api from '../api';
import schemaV2 from './schema_v2.json';

import {
  Alert,
  AlertTitle,
  Box,
  Paper,
  Snackbar,
  Typography,
} from '@mui/material';

// Validator: draft-07 + uuid format (tolerant)
const validator = customizeValidator({
  ajvOptionsOverrides: { allErrors: true, strict: false },
  formats: {
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  }
});

// ---------------- helpers ----------------

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

function buildUiSchema(entitySchema, role) {
  if (!entitySchema?.properties) return {};
  const ui = {};
  const toLabel = (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1);

  for (const [field, prop] of Object.entries(entitySchema.properties)) {
    const xui = prop['x-ui'] || {};
    const entry = (ui[field] = ui[field] || {});

    if (xui.hidden === true) {
      entry['ui:widget'] = 'hidden';
      continue;
    }
    if (Array.isArray(xui.visibleRoles) && !xui.visibleRoles.includes(role)) {
      entry['ui:widget'] = 'hidden';
      continue;
    }

    if (typeof xui.widget === 'string') {
      entry['ui:widget'] = xui.widget;
    } else if (/password/i.test(field)) {
      entry['ui:widget'] = 'password';
    }

    if (xui.options && typeof xui.options === 'object') {
      entry['ui:options'] = { ...(entry['ui:options'] || {}), ...xui.options };
    }

    if (prop.type === 'array' && prop.items && Array.isArray(prop.items.enum)) {
      entry['ui:widget'] = entry['ui:widget'] || 'checkboxes';
      entry['ui:options'] = {
        ...(entry['ui:options'] || {}),
        enumOptions: prop.items.enum.map((v) => ({ value: v, label: toLabel(v) })),
      };
    } else if (Array.isArray(prop.enum)) {
      entry['ui:widget'] = entry['ui:widget'] || 'select';
      entry['ui:options'] = {
        ...(entry['ui:options'] || {}),
        enumOptions: prop.enum.map((v) => ({ value: v, label: toLabel(v) })),
      };
    }

    if (prop.readOnly === true && entry['ui:widget'] !== 'hidden') {
      entry['ui:widget'] = 'hidden';
    }
  }

  // Always hide 'id' in UI if present (backend generates UUID)
  if (entitySchema.properties?.id) {
    ui.id = { ...(ui.id || {}), 'ui:widget': 'hidden' };
  }

  return ui;
}

// --------------- component ---------------

const SchemaForm = ({ table, role, initialData, onSaved }) => {
  const [schema, setSchema] = useState({});
  const [formData, setFormData] = useState(initialData || {});
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [snackOpen, setSnackOpen] = useState(false);

  // hydrate when selection changes (edit vs create)
  useEffect(() => {
    setFormData(initialData || {});
  }, [initialData]);

  // Load entity schema; unique $id; attach definitions; remove 'id' from required
  useEffect(() => {
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

      // reset/create defaults only if not editing
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
  }, [table]);

  const uiSchema = useMemo(() => buildUiSchema(schema, role), [schema, role]);

  // Strip suppressed fields (id) before submit
  function stripSuppressedFields(data) {
    const cleaned = { ...data };
    if ('id' in cleaned) delete cleaned.id;
    return cleaned;
  }

  const onSubmit = ({ formData }) => {
    const payload = stripSuppressedFields(formData);
    const isEdit = !!initialData?.id;
    const url = isEdit ? `/${table}/${initialData.id}` : `/${table}/`;
    const method = isEdit ? 'put' : 'post';

    api({ method, url, data: payload })
      .then((response) => {
        console.log(`${table} saved:`, response.data);
        setFormData(response.data);
        setSnackOpen(true);
        onSaved && onSaved(response.data);
      })
      .catch((err) => {
        console.error(`Error saving ${table}:`, err);
        setErrMsg('Failed to submit form');
      });
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          {table.charAt(0).toUpperCase() + table.slice(1)} ({role})
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {schema?.title || 'Enter details and submit. Required fields are marked.'}
        </Typography>
      </Paper>

      {!!errMsg && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>Error</AlertTitle>
          {errMsg}
        </Alert>
      )}

      {loading ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography>Loading schema...</Typography>
        </Paper>
      ) : schema && schema.properties ? (
        <Form
          key={table} // force remount on entity change
          schema={schema}
          uiSchema={uiSchema}
          formData={formData}
          validator={validator}
          liveValidate
          showErrorList={false}
          onChange={({ formData }) => setFormData(formData)}
          onSubmit={onSubmit}
        />
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography>No schema found for “{table}”.</Typography>
        </Paper>
      )}

      <Snackbar
        open={snackOpen}
        autoHideDuration={3500}
        onClose={() => setSnackOpen(false)}
        message="Saved successfully"
      />
    </Box>
  );
};

export default SchemaForm;
