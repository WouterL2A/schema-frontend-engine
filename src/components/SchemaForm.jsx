import React, { useEffect, useMemo, useState } from 'react';
import Form from '@rjsf/mui';
import validator from '@rjsf/validator-ajv8';
import axios from 'axios';

// Load schema from local JSON (no fetch/CORS)
import schemaV2 from './schema_v2.json';

const SchemaForm = ({ table, role }) => {
  const [schema, setSchema] = useState({});
  const [formData, setFormData] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load table schema from imported JSON
  useEffect(() => {
    try {
      setLoading(true);
      setError(null);
      const tableSchema = schemaV2?.definitions?.[table];
      if (!tableSchema) {
        throw new Error(`Table "${table}" not found in schema_v2.json definitions`);
      }
      setSchema(tableSchema);
    } catch (e) {
      console.error(e);
      setError('Failed to load local schema');
    } finally {
      setLoading(false);
    }
  }, [table]);

  // Build uiSchema from schema hints + role (no hardcoded lists)
  const uiSchema = useMemo(() => {
    if (!schema?.properties) return {};
    const ui = {};
    const toLabel = (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1);

    for (const [field, prop] of Object.entries(schema.properties)) {
      const xui = prop['x-ui'] || {};
      const entry = (ui[field] = ui[field] || {});

      // Visibility
      if (xui.hidden === true) {
        entry['ui:widget'] = 'hidden';
        continue;
      }
      if (Array.isArray(xui.visibleRoles) && !xui.visibleRoles.includes(role)) {
        entry['ui:widget'] = 'hidden';
        continue;
      }

      // Widgets
      if (typeof xui.widget === 'string') {
        entry['ui:widget'] = xui.widget;
      } else if (/password/i.test(field)) {
        // heuristic fallback
        entry['ui:widget'] = 'password';
      }

      // Options passthrough
      if (xui.options && typeof xui.options === 'object') {
        entry['ui:options'] = { ...(entry['ui:options'] || {}), ...xui.options };
      }

      // Enum labeling
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

      // Optional policy: hide readOnly unless overridden
      if (prop.readOnly === true && entry['ui:widget'] !== 'hidden') {
        entry['ui:widget'] = 'hidden';
      }
    }

    return ui;
  }, [schema, role]);

  const onSubmit = ({ formData }) => {
    axios.post(`http://localhost:8000/${table}`, formData)
      .then((response) => {
        console.log(`${table} created:`, response.data);
        setFormData(formData);
        alert('Form submitted successfully!');
      })
      .catch((err) => {
        console.error(`Error creating ${table}:`, err);
        setError('Failed to submit form');
      });
  };

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 12 }}>
        {table.charAt(0).toUpperCase() + table.slice(1)} Form ({role})
      </h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {loading ? (
        <p>Loading schema...</p>
      ) : schema && schema.properties ? (
        <Form
          schema={schema}
          uiSchema={uiSchema}
          formData={formData}
          validator={validator}
          onSubmit={onSubmit}
        />
      ) : (
        <p>No schema found for "{table}".</p>
      )}
    </div>
  );
};

export default SchemaForm;
