import React, { useState, useEffect } from 'react';
import Form from '@rjsf/mui';
import validator from '@rjsf/validator-ajv8';
import axios from 'axios';

// ⬇️ Import the local JSON (path is relative to THIS file)
import schemaV2 from './schema_v2.json';

const SchemaForm = ({ table, role }) => {
  const [schema, setSchema] = useState({});
  const [formData, setFormData] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Role-aware UI customizations (same behavior you had) :contentReference[oaicite:0]{index=0}
  const uiSchema = table === 'users' ? {
    id: { 'ui:widget': 'hidden' },
    hashed_password: { 'ui:widget': 'password' },
    created_at: { 'ui:widget': 'hidden' },
    roles: {
      'ui:widget': role === 'admin' ? 'checkboxes' : 'hidden',
      'ui:options': {
        enumOptions: [
          { value: 'user', label: 'User' },
          { value: 'admin', label: 'Admin' },
          { value: 'manager', label: 'Manager' }
        ]
      }
    },
    permissions: {
      'ui:widget': role === 'admin' ? 'checkboxes' : 'hidden',
      'ui:options': {
        enumOptions: [
          { value: 'read', label: 'Read' },
          { value: 'write', label: 'Write' },
          { value: 'delete', label: 'Delete' }
        ]
      }
    }
  } : {};

  // 🔁 Load schema from imported JSON instead of fetch()
  useEffect(() => {
    try {
      setLoading(true);
      setError(null);

      // Expecting { definitions: { users: {...}, roles: {...}, ... } }
      const tableSchema = schemaV2?.definitions?.[table];

      // Helpful debug:
      console.log('schema_v2.json loaded:', schemaV2);
      console.log('Picked table:', table);
      console.log('Table schema:', tableSchema);

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
    <div style={{ padding: '20px', maxWidth: '600px', margin: 'auto' }}>
      <h2>{table.charAt(0).toUpperCase() + table.slice(1)} Form ({role})</h2>
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
