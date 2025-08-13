import React, { useMemo, useState } from 'react';
import SchemaForm from './components/SchemaForm';
import EntityList from './components/EntityList';
import ConfirmDialog from './components/ConfirmDialog';
import schemaV2 from './components/schema_v2.json';
import './index.css';

import {
  Box,
  Container,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Stack,
  Button,
  Divider,
  Grid,
  Snackbar,
  Alert,
} from '@mui/material';
import api from './api';

const pretty = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');

const App = () => {
  // Discover entities from schema (keys under definitions)
  const entities = useMemo(() => {
    const defs = schemaV2?.definitions || {};
    return Object.keys(defs);
  }, []);

  const [currentEntity, setCurrentEntity] = useState(() => entities[0] || '');
  const [role, setRole] = useState('user');

  // selection (highlight row)
  const [selected, setSelected] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'edit'
  const [pendingDelete, setPendingDelete] = useState(null);

  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const handlePickEntity = (ent) => {
    setCurrentEntity(ent);
    setSelected(null);
    setMode('create');
    setDialogOpen(false);
    setReloadKey((k) => k + 1);
  };

  // === actions wired from EntityList ===
  const handleAdd = () => {
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
      setSnack({ open: true, message: `${pretty(currentEntity)} deleted`, severity: 'success' });
      setPendingDelete(null);
      if (selected?.id === pendingDelete.id) setSelected(null);
      setReloadKey((k) => k + 1);
    } catch {
      setSnack({ open: true, message: `Delete failed`, severity: 'error' });
    } finally {
      setPendingDelete(null);
    }
  };

  const handleSaved = (saved) => {
    setReloadKey((k) => k + 1);
    if (saved?.id) setSelected(saved);
    setSnack({ open: true, message: `${pretty(currentEntity)} saved`, severity: 'success' });
    setDialogOpen(false);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h4" align="center" gutterBottom>
        Schema Frontend Engine Demo
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems="center"
          justifyContent="space-between"
        >
          {/* Role toggle */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1">Role:</Typography>
            <ToggleButtonGroup
              value={role}
              exclusive
              onChange={(_, v) => v && setRole(v)}
              size="small"
              color="primary"
            >
              <ToggleButton value="user">User</ToggleButton>
              <ToggleButton value="admin">Admin</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Divider flexItem sx={{ display: { xs: 'block', md: 'none' }, my: 1 }} />

          {/* Entity buttons discovered from schema */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {entities.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No entities found in schema_v2.json
              </Typography>
            ) : (
              entities.map((ent) => (
                <Button
                  key={ent}
                  variant={currentEntity === ent ? 'contained' : 'outlined'}
                  onClick={() => handlePickEntity(ent)}
                  sx={{ textTransform: 'none' }}
                  title={`Open ${ent} list`}
                >
                  {ent}
                </Button>
              ))
            )}
          </Stack>
        </Stack>
      </Paper>

      <Box>
        {currentEntity ? (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <EntityList
                table={currentEntity}
                onSelect={setSelected}
                selectedId={selected?.id}
                reloadKey={reloadKey}
                // new per-row + header actions:
                onAdd={handleAdd}
                onEdit={handleEdit}
                onDelete={handleAskDelete}
              />
            </Grid>
          </Grid>
        ) : (
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
            <Typography>Select an entity above to get started.</Typography>
          </Paper>
        )}
      </Box>

      {/* Create/Edit dialog */}
      <SchemaForm
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        table={currentEntity}
        role={role}
        mode={mode}
        initialData={mode === 'edit' ? selected : null}
        onSaved={handleSaved}
      />

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete ${pretty(currentEntity).slice(0, -1) || 'item'}?`}
        message={`This action cannot be undone.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={doDelete}
        confirmColor="error"
        confirmText="Delete"
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
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
};

export default App;
