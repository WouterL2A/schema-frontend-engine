import React, { useState, useEffect } from 'react';
  import Form from '@rjsf/mui';
  import { RJSFSchema } from '@rjsf/utils';
  import validator from '@rjsf/validator-ajv8';
  import axios from 'axios';

  const SchemaForm = ({ table, role }) => {
    const [schema, setSchema] = useState({});
    const [formData, setFormData] = useState({});
    const [error, setError] = useState(null);

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

    useEffect(() => {
      axios.get(`http://localhost:8000/schema/${table}`)
        .then(response => setSchema(response.data))
        .catch(error => {
          console.error(`Error fetching ${table} schema:`, error);
          setError('Failed to load schema');
        });
    }, [table]);

    const onSubmit = ({ formData }) => {
      axios.post(`http://localhost:8000/${table}`, formData)
        .then(response => {
          console.log(`${table} created:`, response.data);
          setFormData(formData);
          alert('Form submitted successfully!');
        })
        .catch(error => {
          console.error(`Error creating ${table}:`, error);
          setError('Failed to submit form');
        });
    };

    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: 'auto' }}>
        <h2>{table.charAt(0).toUpperCase() + table.slice(1)} Form ({role})</h2>
        {error ? (
          <p style={{ color: 'red' }}>{error}</p>
        ) : schema.properties ? (
          <Form
            schema={schema}
            uiSchema={uiSchema}
            formData={formData}
            validator={validator}
            onSubmit={onSubmit}
          />
        ) : (
          <p>Loading schema...</p>
        )}
      </div>
    );
  };

  export default SchemaForm;