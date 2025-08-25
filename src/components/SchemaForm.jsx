import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Stack, MenuItem, FormControlLabel, Checkbox, Switch,
  CircularProgress, Typography, InputAdornment
} from '@mui/material';
import schemaV2 from './schema_v2.json';
import api from '../api';
import { getRefOptions, guessLabelKey } from '../utils/refData';

const pretty = (k) => (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ') : '');

function getPropDef(table, key) {
  return schemaV2?.definitions?.[table]?.properties?.[key] || {};
}

/** Build a light description of fields from schema (keeps hashed_password now) */
function buildFieldMeta(table) {
  const def = schemaV2?.definitions?.[table] || {};
  const props = def.properties || {};
  const required = new Set(def.required || []);

  const raw = Object.keys(props)
    .filter((key) => {
      const p = props[key] || {};
      const xui = p['x-ui'] || {};
      if (xui.hidden === true) return false;
      return true;
    })
    .map((key, idx) => {
      const p = props[key] || {};
      const type = Array.isArray(p.type) ? p.type[0] : p.type;
      const format = p.format;

      // FK detection (x-*, plain, or $ref)
      let refTable = p['x-refTable'] || p.refTable || null;
      let refColumn = p['x-refColumn'] || p.refColumn || 'id';
      let relName = p['x-relationshipName'] || p.relationshipName || null;

      if (!refTable && typeof p.$ref === 'string' && p.$ref.includes('#/definitions/')) {
        const after = p.$ref.split('#/definitions/')[1] || '';
        refTable = after.split('/')[0] || null; // tolerate "/properties/id"
        refColumn = 'id';
      }

      const relKey = relName || (key.endsWith('_id') ? key.slice(0, -3) : (refTable ? refTable.replace(/s$/, '') : null));

      return {
        key,
        type,
        format,
        required: required.has(key),
        refTable,
        refColumn,
        relKey,
        enum: Array.isArray(p.enum) ? p.enum : null,
        _idx: idx,
      };
    });

  // ordering (sane defaults)
  const preferredFirst = ['id', 'name', 'email'];
  const preferredLast = ['created_at', 'issued_at', 'expires_at', 'updated_at', 'completed_at', 'started_at'];

  const score = (f) => {
    if (preferredFirst.includes(f.key)) return 100 + preferredFirst.indexOf(f.key);
    if (preferredLast.includes(f.key)) return 900 + preferredLast.indexOf(f.key);
    return 500 + f._idx;
  };

  return raw.slice().sort((a, b) => score(a) - score(b));
}

/** Initialize with good types (arrays default to []) */
function initialValueFor(field, initialData) {
  const { key, relKey, type } = field;
  if (!initialData) return type === 'array' ? [] : '';
  if (initialData[key] != null) return initialData[key];
  if (relKey && initialData[relKey] && typeof initialData[relKey] === 'object') {
    return initialData[relKey].id ?? (type === 'array' ? [] : '');
  }
  return type === 'array' ? [] : '';
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

  // Load FK options (with per-field label override)
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      try {
        const out = {};
        for (const f of fields.filter(ff => !!ff.refTable)) {
          const prop = getPropDef(table, f.key);
          const refLabelOverride = prop?.['x-ui']?.refLabel;
          const labelKey = refLabelOverride || guessLabelKey(schemaV2.definitions, f.refTable);
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
    if (open) loadAll();
    return () => { mounted = false; };
  }, [open, fields, table]);

  const setField = useCallback((key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  // helpers driven by current form
  const isAdminSelected = Array.isArray(form.roles) && form.roles.includes('admin');

  // Which fields to render (mode + heuristics + simple per-field rules)
  const visibleFields = useMemo(() => {
    return fields.filter((f) => {
      // Hide id on create
      if (mode === 'create' && f.key === 'id') return false;

      // Hide passwords on edit (we don't show the stored hash)
      if (mode === 'edit' && f.key === 'hashed_password') return false;

      // Hide server-managed timestamps on create
      if (mode === 'create' && ['created_at', 'updated_at', 'issued_at', 'completed_at', 'started_at', 'expires_at'].includes(f.key)) {
        return false;
      }

      // Conditional field: permissions only when roles includes 'admin'
      if (f.key === 'permissions' && !isAdminSelected) return false;

      return true;
    });
  }, [fields, mode, isAdminSelected]);

  const labelFor = (f) => {
    if (f.key === 'hashed_password') return 'Password';
    const p = getPropDef(table, f.key);
    return p.title || pretty(f.key);
  };

  const placeholderOf = (f) => {
    const p = getPropDef(table, f.key);
    return p?.['x-ui']?.placeholder || undefined;
  };

  const helpTextOf = (f, readOnly) => {
    if (readOnly) return 'Read only';
    const p = getPropDef(table, f.key);
    return p?.['x-ui']?.help || p?.description || '';
  };

  const adornmentsOf = (f) => {
    const p = getPropDef(table, f.key);
    const xui = p['x-ui'] || {};
    const start = xui.prefix ? <InputAdornment position="start">{xui.prefix}</InputAdornment> : undefined;
    const end = xui.suffix ? <InputAdornment position="end">{xui.suffix}</InputAdornment> : undefined;
    return (start || end) ? { startAdornment: start, endAdornment: end } : undefined;
  };

  const numberStepOf = (f) => {
    const p = getPropDef(table, f.key);
    const xui = p['x-ui'] || {};
    return (typeof xui.step === 'number' || typeof xui.step === 'string') ? xui.step : undefined;
  };

  const isReadOnly = (f) => {
    // base heuristics
    const heuristic =
      (f.key === 'id' && mode === 'edit') ||
      ['created_at', 'updated_at', 'completed_at', 'started_at', 'issued_at', 'expires_at', 'created_by', 'updated_by']
        .includes(f.key);

    // per-field overrides
    const p = getPropDef(table, f.key);
    const xui = p['x-ui'] || {};
    if (xui.readOnly === true) return true;
    if (mode === 'create' && xui.readOnlyOnCreate === true) return true;
    if (mode === 'edit' && xui.readOnlyOnEdit === true) return true;

    return heuristic;
  };

  // Array enum helpers
  const arrayEnumOf = (f) => {
    const p = getPropDef(table, f.key);
    const items = p?.items || {};
    return Array.isArray(items.enum) ? items.enum : null;
  };
  const arrayEnumLabelsOf = (f) => {
    const p = getPropDef(table, f.key);
    const labels = p?.['x-ui']?.enumLabels;
    return Array.isArray(labels) ? labels : null;
  };

  const handleSubmit = async () => {
    setSaving(true);
    setSaveErr('');
    try {
      // simple client-side rule: permissions required if admin selected
      if (isAdminSelected && (!Array.isArray(form.permissions) || form.permissions.length === 0)) {
        throw new Error('Permissions are required when Roles include “admin”.');
      }

      const payload = {};
      for (const f of fields) {
        if (mode === 'create' && f.key === 'id') continue; // don’t send id on create

        const v = form[f.key];
        if (f.type === 'array') {
          if (Array.isArray(v) && v.length > 0) payload[f.key] = v;
          continue;
        }
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

  // One field renderer
  const renderField = (f) => {
    const value = form[f.key];
    const readOnly = isReadOnly(f);

    // FK select
    if (f.refTable) {
      const opts = fkOptions[f.key]?.options || [];
      return (
        <TextField
          key={f.key}
          label={labelFor(f)}
          fullWidth
          size="small"
          margin="dense"
          value={value ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={f.required && (mode === 'create' || f.key !== 'id')}
          disabled={readOnly || saving}
          select
          placeholder={placeholderOf(f)}
          helperText={helpTextOf(f, readOnly)}
          InputProps={adornmentsOf(f)}
        >
          {opts.map((opt) => (
            <MenuItem key={String(opt.value)} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      );
    }

    // ARRAY of enum → multi-select
    if (f.type === 'array') {
      const enums = arrayEnumOf(f);
      if (Array.isArray(enums) && enums.length > 0) {
        const labels = arrayEnumLabelsOf(f);
        const arrVal = Array.isArray(value) ? value : [];
        return (
          <TextField
            key={f.key}
            label={labelFor(f)}
            fullWidth
            size="small"
            margin="dense"
            value={arrVal}
            onChange={(e) => {
              const next = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
              setField(f.key, next);
            }}
            required={
              // special case: permissions required if admin selected
              f.key === 'permissions' ? isAdminSelected : (f.required && (mode === 'create' || f.key !== 'id'))
            }
            disabled={readOnly || saving}
            select
            SelectProps={{
              multiple: true,
              renderValue: (selected) => (selected || []).join(', '),
            }}
            placeholder={placeholderOf(f)}
            helperText={helpTextOf(f, readOnly)}
            InputProps={adornmentsOf(f)}
          >
            {enums.map((val, i) => (
              <MenuItem key={String(val)} value={val}>
                {labels && labels[i] ? labels[i] : String(val)}
              </MenuItem>
            ))}
          </TextField>
        );
      }
      // Fallback: comma-separated text
      return (
        <TextField
          key={f.key}
          label={labelFor(f)}
          fullWidth
          size="small"
          margin="dense"
          value={Array.isArray(value) ? value.join(',') : (value ?? '')}
          onChange={(e) => setField(f.key, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          required={f.required && (mode === 'create' || f.key !== 'id')}
          disabled={readOnly || saving}
          placeholder={placeholderOf(f)}
          helperText={helpTextOf(f, readOnly)}
          InputProps={adornmentsOf(f)}
        />
      );
    }

    // boolean → checkbox (or switch when x-ui.widget === 'switch')
    if (f.type === 'boolean') {
      const checked = !!value;
      const widget = getPropDef(table, f.key)?.['x-ui']?.widget;
      if (widget === 'switch') {
        return (
          <FormControlLabel
            key={f.key}
            control={
              <Switch
                size="small"
                checked={checked}
                onChange={(e) => setField(f.key, e.target.checked)}
                disabled={readOnly || saving}
              />
            }
            label={labelFor(f)}
          />
        );
      }
      return (
        <FormControlLabel
          key={f.key}
          control={
            <Checkbox
              size="small"
              checked={checked}
              onChange={(e) => setField(f.key, e.target.checked)}
              disabled={readOnly || saving}
            />
          }
          label={labelFor(f)}
        />
      );
    }

    // hashed_password → password input (create only; hidden on edit)
    if (f.key === 'hashed_password') {
      return (
        <TextField
          key={f.key}
          label="Password"
          fullWidth
          size="small"
          margin="dense"
          type="password"
          value={value ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={mode === 'create'} // required by schema
          disabled={saving}
          placeholder="Enter a strong password"
          helperText="Will be securely stored by the server"
        />
      );
    }

    // explicit widgets from x-ui
    const widget = getPropDef(table, f.key)?.['x-ui']?.widget;
    if (widget === 'password') {
      return (
        <TextField
          key={f.key}
          label={labelFor(f)}
          fullWidth
          size="small"
          margin="dense"
          type="password"
          value={value ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={f.required && (mode === 'create' || f.key !== 'id')}
          disabled={readOnly || saving}
          placeholder={placeholderOf(f)}
          helperText={helpTextOf(f, readOnly)}
        />
      );
    }
    if (widget === 'textarea') {
      const rows = getPropDef(table, f.key)?.['x-ui']?.rows ?? 3;
      return (
        <TextField
          key={f.key}
          label={labelFor(f)}
          fullWidth
          size="small"
          margin="dense"
          multiline
          rows={rows}
          value={value ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={f.required && (mode === 'create' || f.key !== 'id')}
          disabled={readOnly || saving}
          placeholder={placeholderOf(f)}
          helperText={helpTextOf(f, readOnly)}
        />
      );
    }
    if (widget === 'number') {
      return (
        <TextField
          key={f.key}
          label={labelFor(f)}
          fullWidth
          size="small"
          margin="dense"
          type="number"
          value={value ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={f.required && (mode === 'create' || f.key !== 'id')}
          disabled={readOnly || saving}
          placeholder={placeholderOf(f)}
          helperText={helpTextOf(f, readOnly)}
          InputProps={{ ...adornmentsOf(f), inputProps: { step: numberStepOf(f) } }}
        />
      );
    }

    // by format
    if (f.format === 'date-time') {
      return (
        <TextField
          key={f.key}
          label={labelFor(f)}
          fullWidth
          size="small"
          margin="dense"
          type="datetime-local"
          value={value ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={f.required && (mode === 'create' || f.key !== 'id')}
          disabled={readOnly || saving}
          InputLabelProps={{ shrink: true }}
          helperText={helpTextOf(f, readOnly)}
        />
      );
    }
    if (f.format === 'email') {
      return (
        <TextField
          key={f.key}
          label={labelFor(f)}
          fullWidth
          size="small"
          margin="dense"
          type="email"
          value={value ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={f.required && (mode === 'create' || f.key !== 'id')}
          disabled={readOnly || saving}
          placeholder={placeholderOf(f)}
          helperText={helpTextOf(f, readOnly)}
        />
      );
    }

    // numbers
    if (f.type === 'integer' || f.type === 'number') {
      return (
        <TextField
          key={f.key}
          label={labelFor(f)}
          fullWidth
          size="small"
          margin="dense"
          type="number"
          value={value ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          required={f.required && (mode === 'create' || f.key !== 'id')}
          disabled={readOnly || saving}
          placeholder={placeholderOf(f)}
          helperText={helpTextOf(f, readOnly)}
          InputProps={{ ...adornmentsOf(f), inputProps: { step: numberStepOf(f) } }}
        />
      );
    }

    // default: text
    return (
      <TextField
        key={f.key}
        label={labelFor(f)}
        fullWidth
        size="small"
        margin="dense"
        value={value ?? ''}
        onChange={(e) => setField(f.key, e.target.value)}
        required={f.required && (mode === 'create' || f.key !== 'id')}
        disabled={readOnly || saving}
        placeholder={placeholderOf(f)}
        helperText={helpTextOf(f, readOnly)}
        InputProps={adornmentsOf(f)}
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
