import React, { useState } from 'react';
import SchemaForm from './components/SchemaForm';
import './index.css';

const App = () => {
  const [role, setRole] = useState('user');

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Schema Frontend Engine Demo</h1>
      <div style={{ marginBottom: '20px' }}>
        <button
          style={{ margin: '5px', padding: '10px', background: role === 'user' ? '#007bff' : '#ccc', color: 'white', borderRadius: '4px' }}
          onClick={() => setRole('user')}
        >
          User View
        </button>
        <button
          style={{ margin: '5px', padding: '10px', background: role === 'admin' ? '#007bff' : '#ccc', color: 'white', borderRadius: '4px' }}
          onClick={() => setRole('admin')}
        >
          Admin View
        </button>
      </div>
      <SchemaForm table="users" role={role} />
    </div>
  );
};

export default App;
