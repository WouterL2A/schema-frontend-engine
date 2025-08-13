import React, { useMemo, useState } from 'react';
import SchemaForm from './components/SchemaForm';
import EntityList from './components/EntityList';
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
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import api from './api';

const App = () => {
  // Discover entities from schema (keys under definitions)
  const entities = useMemo(() => {
    const defs = schemaV2?.definitions || {};
    return Object.keys(defs);
  }, []);

  const [currentEntity, setCurrentEntity] = useState(() => entities[0] || '');
  const [role, setRole] = useState('user');
  const [selected, setSelected] = useState(null);   // selected record (row) for editing
  const [mode, setMode] = useState('create');       // 'create' | 'edit'
  const [reloadKey, setReloadKey] = useState(0);    // trigger list reloads
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const handlePickEntity = (ent) => {
    setCurrentEntity(ent);
    setSelected(null);
    setMode('create');
    setReloadKey((k) => k + 1);
  };

  const handleAdd = () => {
    setSelected(null);
    setMode('create');
  };

  const handleEdit = () => {
    if (!selected?.id) return;
    setMode('edit');
  };

  const handleDelete = async () => {
    if (!selected?.id) return;
    const ok = window.confirm(`Delete this ${currentEntity.slice(0, -1) || 'item'}?`);
    if (!ok) return;
    try {
      await api.delete(`/${currentEntity}/${selected.id}`);
      setSnack({ open: true, message: 'Deleted successfully', severity: 'success' });
      setSelected(null);
      setMode('create');
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSnack({ open: true, message: 'Delete failed', severity: 'error' });
    }
  };

  const handleSaved = (saved) => {
    // When a save completes, refresh the list and keep/edit selection context
    setReloadKey((k) => k + 1);
    if (saved?.id) {
      setSelected(saved);
      setMode('edit');
    } else {
      setSelected(null);
      setMode('create');
    }
    setSnack({ open: true, message: 'Saved successfully', severity: 'success' });
  };

  const isRowSelected = !!selected?.id;

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
                  title={`Open ${ent} form`}
                >
                  {ent}
                </Button>
              ))
            )}
          </Stack>

          {/* CRUD toolbar */}
          <Stack direction="row" spacing={1}>
            <Button startIcon={<AddIcon />} variant="contained" onClick={handleAdd}>
              Add
            </Button>
            <Button
              startIcon={<EditIcon />}
              variant="outlined"
              onClick={handleEdit}
              disabled={!isRowSelected}
            >
              Edit
            </Button>
            <Button
              startIcon={<DeleteIcon />}
              variant="outlined"
              color="error"
              onClick={handleDelete}
              disabled={!isRowSelected}
            >
              Delete
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Box>
        {currentEntity ? (
          <Grid container spacing={2}>
            {/* Left: list of records */}
            <Grid item xs={12} md={6}>
              <EntityList
                table={currentEntity}
                onSelect={setSelected}
                selectedId={selected?.id}
                reloadKey={reloadKey}
              />
            </Grid>

            {/* Right: create/edit form */}
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <SchemaForm
                  table={currentEntity}
                  role={role}
                  mode={mode}
                  initialData={mode === 'edit' ? selected : null}
                  onSaved={handleSaved}
                  onCancel={() => {
                    setMode('create');
                    setSelected(null);
                  }}
                />
              </Paper>
            </Grid>
          </Grid>
        ) : (
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
            <Typography>Select an entity above to get started.</Typography>
          </Paper>
        )}
      </Box>

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
