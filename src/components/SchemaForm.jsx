import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Stack, MenuItem, FormControlLabel, Checkbox,
  CircularProgress, Typography
} from '@mui/material';
import schemaV2 from './schema_v2.json';
import api from '../api';
import { getRefOptions, guessLabelKey } from '../utils/refData';

const pretty = (k) => (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ') : '');

/** Build a light description of fields from schema */
function buildFieldMeta(table) {
  const def = schemaV2?.definitions?.[table] || {};
  const props = def.properties || {};
  const required = new Set(def.required || []);

  const fields = Object.keys(props)
    .filter((key) => {
      const p = props[key] || {};
      const xui = p['x-ui'] || {};
      if (xui.hidden === true) return false;
      if (key === 'hashed_password') return false; // example skip
      return true;
    })
    .map((key) => {
      const p = props[key] || {};
      const type = Array.isArray(p.type) ? p.type[0] : p.type;
      const format = p.format;

      // FK detection (accept x-*, plain, or $ref)
      let refTable = p['x-refTable'] || p.refTable || null;
      let refColumn = p['x-refColumn'] || p.refColumn || 'id';
      let relName = p['x-relationshipName'] || p.relationshipName || null;

      if (!refTable && typeof p.$ref === 'string' && p.$ref.includes('#/definitions/')) {
        const after = p.$ref.split('#/definitions/')[1] || '';
        refTable = after.split('/')[0] || null;
        refColumn = 'id';
      }

      // derive relKey for nested payloads (user_id -> user)
      const relKey = relName || (key.endsWith('_id') ? key.slice(0, -3) : (refTable ? refTable.replace(/s$/, '') : null));

      return {
        key,
        type,
        format,
        required: required.has(key),
        refTable,
        refColumn,
        relKey,
      };
    });

  // small stable ordering: id first, timestamps last
  const preferredFirst = ['id', 'name', 'email'];
  const preferredLast = ['created_at', 'issued_at', 'expires_at', 'updated_at', 'completed_at', 'started_at'];
  const ordered = [
    ...preferredFirst.filter((k) => fields.some(f => f.key === k)),
    ...fields.map(f => f.key).filter((k) => !preferredFirst.includes(k) && !preferredLast.includes(k)),
    ...preferredLast.filter((k) => fields.some(f => f.key === k)),
  ];
  const byKey = Object.fromEntries(fields.map(f => [f.key, f]));
  return ordered.map(k => byKey[k]).filter(Boolean);
}

/** Normalize initial value: use *_id, or nested rel.id if present */
function initialValueFor(field, initialData) {
  const { key, relKey } = field;
  if (!initialData) return '';
  if (initialData[key] != null) return initialData[key];
  if (relKey && initialData[relKey] && typeof initialData[relKey] === 'object') {
    return initialData[relKey].id ?? '';
  }
  return '';
}

export default function SchemaForm({
  open,
  onClose,
  table,
  role,           // reserved for RBAC
  mode = 'create',// 'create' | 'edit'
  initialData,
  onSaved,
}) {
  const fields = useMemo(() => buildFieldMeta(table), [table]);

  // Hide PK on create (usually auto-generated)
  const visibleFields = useMemo(
    () => fields.filter(f => !(mode === 'create' && f.key === 'id')),
    [fields, mode]
  );

  // Split FK fields
  const fkFields = useMemo(() => fields.filter(f => !!f.refTable), [fields]);

  // Form state
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [saveErr, setSaveErr] = useState('');

  // FK option maps { colKey: { options: [{value,label}], map: Map<value,label> } }
  const [fkOptions, setFkOptions] = useState({});

  // Init form on open/table/change
  useEffect(() => {
    if (!open) return;
    const init = {};
    fields.forEach((f) => {
      init[f.key] = initialValueFor(f, initialData);
    });
    setForm(init);
    setSaveErr('');
    setLoadErr('');
  }, [open, table, initialData, fields]);

  // Load FK options
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      try {
        const out = {};
        for (const f of fkFields) {
          const labelKey = guessLabelKey(schemaV2.definitions, f.refTable);
          const { options, opts, map } = await getRefOptions(
            f.refTable,
            f.refColumn || 'id',
            labelKey || 'name'
          );
          if (!mounted) return;
          out[f.key] = { options: options || opts || [], map };
        }
        if (mounted) setFkOptions(out);
      } catch (e) {
        if (mounted) setLoadErr('Failed to load reference data');
      }
    }
    if (open && fkFields.length) loadAll();
    else setFkOptions({});
    return () => { mounted = false; };
  }, [open, fkFields]);

  const setField = useCallback((key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    setSaveErr('');
    try {
      // Build payload; drop empty strings and read-onlys
      const payload = {};
      for (const f of fields) {
        if (mode === 'create' && f.key === 'id') continue; // don’t send id on create
        const v = form[f.key];
        if (v === '' || v === undefined) continue;
        payload[f.key] = typeof v === 'string' ? v.trim() : v;
      }

      let saved;
      if (mode === 'create') {
        saved = await api.post(`/${table}/`, payload);
      } else {
        const id = initialData?.id ?? form.id;
        if (!id) throw new Error('Missing id for update');
        saved = await api.put(`/${table}/${id}`, payload);
      }

      const data = saved?.data ?? saved;
      onSaved?.(data);
      onClose?.();
    } catch (e) {
      setSaveErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Render one field
  const renderField = (f) => {
    const value = form[f.key] ?? '';
    const commonProps = {
      label: pretty(f.key),
      fullWidth: true,
      size: 'small',
      margin: 'dense',
      value,
      onChange: (e) => setField(f.key, e.target.value),
      required: f.required && (mode === 'create' || f.key !== 'id'),
    };

    // Read-only heuristics
    const readOnly =
      (f.key === 'id' && mode === 'edit') ||
      ['created_at', 'updated_at', 'completed_at', 'started_at', 'issued_at', 'expires_at'].includes(f.key);

    // FK select
    if (f.refTable) {
      const opts = fkOptions[f.key]?.options || [];
      return (
        <TextField
          key={f.key}
          {...commonProps}
          select
          disabled={readOnly || saving}
          helperText={readOnly ? 'Read only' : ''}
        >
          {opts.map((opt) => (
            <MenuItem key={String(opt.value)} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      );
    }

    // booleans → checkbox
    if (f.type === 'boolean') {
      return (
        <FormControlLabel
          key={f.key}
          control={
            <Checkbox
              size="small"
              checked={!!value}
              onChange={(e) => setField(f.key, e.target.checked)}
              disabled={readOnly || saving}
            />
          }
          label={pretty(f.key)}
        />
      );
    }

    // datetime
    if (f.format === 'date-time') {
      return (
        <TextField
          key={f.key}
          {...commonProps}
          type="datetime-local"
          disabled={readOnly || saving}
          InputLabelProps={{ shrink: true }}
        />
      );
    }

    // email
    if (f.format === 'email') {
      return (
        <TextField
          key={f.key}
          {...commonProps}
          type="email"
          disabled={readOnly || saving}
        />
      );
    }

    // integer/number
    if (f.type === 'integer' || f.type === 'number') {
      return (
        <TextField
          key={f.key}
          {...commonProps}
          type="number"
          disabled={readOnly || saving}
        />
      );
    }

    // default: text
    return (
      <TextField
        key={f.key}
        {...commonProps}
        disabled={readOnly || saving}
      />
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'create' ? `Add ${pretty(table).slice(0, -1)}` : `Edit ${pretty(table).slice(0, -1)}`}
      </DialogTitle>
      <DialogContent dividers>
        {loadErr && <Typography color="error" sx={{ mb: 1 }}>{loadErr}</Typography>}
        <Stack spacing={1}>
          {visibleFields.map(renderField)}
        </Stack>
        {saveErr && (
          <Typography color="error" sx={{ mt: 1 }}>
            {saveErr}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : (mode === 'create' ? 'Create' : 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
