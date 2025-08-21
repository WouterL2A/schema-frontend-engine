import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Typography, Box, CircularProgress, TextField, Stack,
  IconButton, Tooltip, Button
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

import schemaV2 from './schema_v2.json';
import api from '../api';
import { getRefOptions, guessLabelKey } from '../utils/refData';

const pretty = (k) => k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');

/** Choose a small set of “useful” columns for the table */
function inferColumns(table) {
  const def = schemaV2?.definitions?.[table];
  const props = def?.properties || {};
  const keys = Object.keys(props)
    .filter((k) => {
      const p = props[k] || {};
      const xui = p['x-ui'] || {};
      if (xui.hidden === true) return false;
      if (k === 'hashed_password') return false;
      return true;
    });

  const preferredFirst = ['id', 'name', 'email'];
  const preferredLast = ['created_at', 'issued_at', 'expires_at'];

  const sorted = [
    ...preferredFirst.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !preferredFirst.includes(k) && !preferredLast.includes(k)),
    ...preferredLast.filter((k) => keys.includes(k)),
  ];

  return sorted.slice(0, 6);
}

/** Detect FK fields for the current table using the schema (handles x-ref*) */
function detectFkConfigFromSchema(table) {
  const def = schemaV2?.definitions?.[table];
  const props = def?.properties || {};
  const out = {};
  for (const [field, prop] of Object.entries(props)) {
    let refTable;
    let refColumn = 'id';
    let relName = null;

    // Prefer explicit metadata (accept both x-* and plain)
    if (prop['x-refTable'] || prop.refTable) {
      refTable = prop['x-refTable'] || prop.refTable;
      refColumn = prop['x-refColumn'] || prop.refColumn || 'id';
      relName = prop['x-relationshipName'] || prop.relationshipName || null;
    } else if (typeof prop.$ref === 'string' && prop.$ref.includes('#/definitions/')) {
      // $ref: "#/definitions/users/properties/id"
      const afterDefs = prop.$ref.split('#/definitions/')[1] || '';
      refTable = afterDefs.split('/')[0]; // "users"
      refColumn = 'id';
      relName = null;
    }

    if (refTable) {
      const labelKey = guessLabelKey(schemaV2.definitions, refTable);
      const derivedRel =
        relName ||
        (field.endsWith('_id') ? field.slice(0, -3) : refTable.replace(/s$/, ''));
      out[field] = {
        table: refTable,
        valueKey: refColumn,
        labelKey,
        relKey: derivedRel, // relationship property expected in API payload
      };
    }
  }
  return out; // e.g. { user_id: { table:'users', valueKey:'id', labelKey:'email', relKey:'user' }, ... }
}

/** Runtime FK detection (from row shape): *_id with sibling object {base:{...}} */
function detectFkConfigFromRows(sampleRow) {
  const out = {};
  if (!sampleRow || typeof sampleRow !== 'object') return out;
  Object.keys(sampleRow).forEach((k) => {
    if (k.endsWith('_id')) {
      const base = k.slice(0, -3);
      const sibling = sampleRow[base];
      if (sibling && typeof sibling === 'object') {
        out[k] = { table: null, valueKey: 'id', labelKey: null, relKey: base };
      }
    }
  });
  return out;
}

function mergeFkConfig(schemaCfg, runtimeCfg) {
  const out = { ...schemaCfg };
  for (const [col, cfg] of Object.entries(runtimeCfg)) {
    if (!out[col]) out[col] = cfg;
    else if (!out[col].relKey && cfg.relKey) out[col].relKey = cfg.relKey;
  }
  return out;
}

function formatBasic(value) {
  if (value == null) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    try { return new Date(value).toLocaleString(); } catch { return value; }
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export default function EntityList({
  table,
  onSelect,
  selectedId,
  reloadKey,
  onAdd,
  onEdit,
  onDelete,
}) {
  const columns = useMemo(() => inferColumns(table), [table]);

  // FK config from schema (x-ref aware)
  const schemaFkConfig = useMemo(() => detectFkConfigFromSchema(table), [table]);

  // FK label maps per column: { columnName: Map<id, label> }
  const [fkMaps, setFkMaps] = useState({});

  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRpp] = useState(10);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  // Build include list for visible FK columns.
  const buildIncludeList = useCallback((fkConfigObj) => {
    const visibleFks = Object.keys(fkConfigObj).filter((c) => columns.includes(c));
    const rels = visibleFks
      .map((c) => fkConfigObj[c].relKey)
      .filter(Boolean);
    return [...new Set(rels)];
  }, [columns]);

  // Two-step load: probe → derive includes → fetch page
  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      // Step 1: probe without includes to detect *_id and any runtime rel keys
      const probe = await api.get(`/${table}/`, { params: { limit: 1, offset: page * rowsPerPage } });
      const probeData = probe.data || probe || {};
      const sample = probeData.items?.[0];

      // Merge FK detection: schema + runtime (handles current backend shape)
      const runtimeFkConfig = detectFkConfigFromRows(sample);
      const fkConfig = mergeFkConfig(schemaFkConfig, runtimeFkConfig);

      const includeList = buildIncludeList(fkConfig);
      const params = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };
      if (includeList.length) params.include = includeList.join(',');

      // Step 2: fetch full page with includes
      const res = await api.get(`/${table}/`, { params });
      const data = res.data || res || {};
      setAllRows(data.items || []);
      setTotal(data.total || 0);

      // Load FK label maps (so we can still render friendly value even if nested missing)
      const entries = Object.entries(fkConfig);
      if (entries.length) {
        const results = await Promise.all(
          entries.map(([_, cfg]) => {
            if (!cfg.table) return Promise.resolve({ map: new Map() });
            return getRefOptions(cfg.table, cfg.valueKey || 'id', cfg.labelKey || 'name');
          })
        );
        const maps = {};
        entries.forEach(([col, _cfg], i) => { maps[col] = results[i].map; });
        setFkMaps(maps);
      } else {
        setFkMaps({});
      }
    } catch (e) {
      setErr(`Failed to load ${table}`);
    } finally {
      setLoading(false);
    }
  }, [table, page, rowsPerPage, schemaFkConfig, buildIncludeList]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Simple client-side search across visible columns (uses nested rel.display, then label map, else raw)
  useEffect(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return setRows(allRows);

    // Recreate fkConfig based on the current table/rows to use during search rendering
    const runtimeFk = detectFkConfigFromRows(allRows?.[0]);
    const fkConfig = mergeFkConfig(schemaFkConfig, runtimeFk);

    setRows(
      allRows.filter((r) =>
        columns.some((c) => {
          const cfg = fkConfig[c];
          let val;
          if (cfg) {
            const nested = r[cfg.relKey];
            if (nested && typeof nested === 'object') {
              val = nested.display ?? nested.id ?? r[c];
            } else {
              val = fkMaps[c]?.get(r[c]) ?? r[c];
            }
          } else {
            val = r[c];
          }
          return String(val ?? '').toLowerCase().includes(needle);
        })
      )
    );
  }, [q, allRows, columns, schemaFkConfig, fkMaps]);

  const renderCell = (col, value, row) => {
    // Recompute FK config for current row (cheap)
    const runtimeFk = detectFkConfigFromRows(row);
    const fkConfig = mergeFkConfig(schemaFkConfig, runtimeFk);
    const cfg = fkConfig[col];
    if (cfg) {
      // Prefer server-provided nested relation
      const nested = row?.[cfg.relKey];
      if (nested && typeof nested === 'object') {
        if (nested.display != null) return nested.display;
        if (nested.id != null) return nested.id;
      }
      // Fallback to label map
      const label = fkMaps[col]?.get(value);
      if (label != null) return label;
      // Fallback to raw id
      return value ?? '';
    }
    return formatBasic(value);
  };

  // Friendly headers (show relationship name for *_id)
  const headerFor = (col) => {
    // Prefer schema config; fallback to runtime guess from a sample row
    const runtimeFk = detectFkConfigFromRows(allRows?.[0]);
    const fkConfig = mergeFkConfig(schemaFkConfig, runtimeFk);
    const cfg = fkConfig[col];
    if (cfg?.relKey) return pretty(cfg.relKey);
    return pretty(col);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">
          {pretty(table)} — {total} record{total === 1 ? '' : 's'}
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Tooltip title="Refresh">
            <span>
              <IconButton onClick={load} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
          {onAdd && (
            <Button startIcon={<AddIcon />} variant="contained" onClick={onAdd}>
              Add
            </Button>
          )}
        </Stack>
      </Stack>

      {err && <Typography color="error" sx={{ mb: 1 }}>{err}</Typography>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {columns.map((c) => (
                    <TableCell key={c} sx={{ fontWeight: 600 }}>
                      {headerFor(c)}
                    </TableCell>
                  ))}
                  {(onEdit || onDelete) && <TableCell sx={{ fontWeight: 600, width: 120 }}>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const isSelected = selectedId && row.id === selectedId;
                  return (
                    <TableRow
                      key={row.id || JSON.stringify(row)}
                      hover
                      selected={!!isSelected}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => onSelect && onSelect(row)}
                    >
                      {columns.map((c) => (
                        <TableCell key={c}>
                          {renderCell(c, row[c], row)}
                        </TableCell>
                      ))}
                      {(onEdit || onDelete) && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {onEdit && (
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => onEdit(row)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {onDelete && (
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => onDelete(row)}
                                sx={{ ml: 0.5 }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRpp(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25, 50]}
          />
        </>
      )}
    </Paper>
  );
}
