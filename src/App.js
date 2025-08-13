import React, { useMemo, useState } from 'react';
import SchemaForm from './components/SchemaForm';
import schemaV2 from './components/schema_v2.json';
import './index.css';

const App = () => {
  // Discover entities from schema (definitions keys)
  const entities = useMemo(() => {
    const defs = schemaV2?.definitions || {};
    return Object.keys(defs);
  }, []);

  // Default: first entity if present
  const [currentEntity, setCurrentEntity] = useState(() => entities[0] || '');
  const [role, setRole] = useState('user');

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ textAlign: 'center', marginBottom: 12 }}>
        Schema Frontend Engine Demo
      </h1>

      {/* Role toggle */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
        <button
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: role === 'user' ? '#007bff' : '#f2f2f2',
            color: role === 'user' ? '#fff' : '#333',
            cursor: 'pointer'
          }}
          onClick={() => setRole('user')}
        >
          User View
        </button>
        <button
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: role === 'admin' ? '#007bff' : '#f2f2f2',
            color: role === 'admin' ? '#fff' : '#333',
            cursor: 'pointer'
          }}
          onClick={() => setRole('admin')}
        >
          Admin View
        </button>
      </div>

      {/* Entity buttons (discovered from schema) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
        {entities.length === 0 ? (
          <em>No entities found in schema_v2.json</em>
        ) : (
          entities.map((ent) => (
            <button
              key={ent}
              onClick={() => setCurrentEntity(ent)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #ccc',
                background: currentEntity === ent ? '#222' : '#fff',
                color: currentEntity === ent ? '#fff' : '#333',
                cursor: 'pointer'
              }}
              title={`Open ${ent} form`}
            >
              {ent}
            </button>
          ))
        )}
      </div>

      {/* Active form */}
      {currentEntity ? (
        <SchemaForm table={currentEntity} role={role} />
      ) : (
        <div style={{ textAlign: 'center' }}>
          <em>Select an entity above to get started.</em>
        </div>
      )}
    </div>
  );
};

export default App;
