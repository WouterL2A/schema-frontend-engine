// src/App.js
import React, { useMemo, useState } from 'react';
import SchemaForm from './components/SchemaForm';
import EntityList from './components/EntityList';
import ConfirmDialog from './components/ConfirmDialog';
import SchemaNavigation from './components/SchemaNavigation';
import './index.css';

import {
  Container,
  Paper,
  Stack,
  Button,
  Snackbar,
  Alert,
} from '@mui/material';

import api from './api';
import { getGroups, entityTitle } from './schemaRegistry';

export default function App() {
  const groups = useMemo(() => getGroups(), []);
  const initialEntity = useMemo(() => groups?.[0]?.entities?.[0] || '', [groups]);

  const [currentEntity, setCurrentEntity] = useState(initialEntity);
  const [selected, setSelected] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'edit'
  const [pendingDelete, setPendingDelete] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const title = useMemo(() => entityTitle(currentEntity), [currentEntity]);

  const handleAdd = () => {
    setSelected(null);
    setMode('create');
    setDialogOpen(true);
  };

  const handleEdit = (row) => {
    setSelected(row);
    setMode('edit');
    setDialogOpen(true);
  };

  const handleAskDelete = (row) => {
    setPendingDelete(row);
  };

  const doDelete = async () => {
    if (!pendingDelete?.id) return;
    try {
      await api.delete(`/${currentEntity}/${pendingDelete.id}`);
      setSnack({ open: true, message: `${title} deleted`, severity: 'success' });
      setPendingDelete(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Delete failed';
      setSnack({ open: true, message: msg, severity: 'error' });
    }
  };

  const onSaved = () => {
    setDialogOpen(false);
    setSelected(null);
    setSnack({ open: true, message: `${title} ${mode === 'create' ? 'created' : 'saved'}`, severity: 'success' });
    setReloadKey((k) => k + 1);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Navigation (breadcrumbs + group/entity selectors) */}
      <SchemaNavigation currentEntity={currentEntity} onChangeEntity={setCurrentEntity} />

      {/* List + actions */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <strong>{title}</strong>
          <Button variant="contained" onClick={handleAdd}>Add</Button>
        </Stack>
        <EntityList
          table={currentEntity}
          onSelect={() => {}}
          selectedId={selected?.id}
          reloadKey={reloadKey}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleAskDelete}
        />
      </Paper>

      {/* Create/Edit form */}
      <SchemaForm
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        table={currentEntity}
        mode={mode}
        initialData={selected || {}}
        onSaved={onSaved}
      />

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete ${title}`}
        message={`Are you sure you want to delete this ${title.slice(0, -1) || 'item'}? This cannot be undone.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={doDelete}
        confirmColor="error"
        confirmText="Delete"
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
