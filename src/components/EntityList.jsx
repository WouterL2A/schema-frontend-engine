import React, { useEffect, useMemo, useState } from 'react';
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

/** Detect FK fields on the current table with ref table + label resolution */
function detectFkConfig(table) {
  const def = schemaV2?.definitions?.[table];
  const props = def?.properties || {};
  const out = {};
  for (const [field, prop] of Object.entries(props)) {
    let refTable;
    if (prop.refTable) {
      refTable = prop.refTable;
    } else if (typeof prop.$ref === 'string' && prop.$ref.includes('#/definitions/')) {
      refTable = prop.$ref.split('#/definitions/')[1].split('/')[0];
    }
    if (refTable) {
      out[field] = {
        table: refTable,
        valueKey: prop.refColumn || 'id',
        labelKey: guessLabelKey(schemaV2.definitions, refTable),
      };
    }
  }
  return out; // { user_id: {table:'users', valueKey:'id', labelKey:'email'}, role_id: {...} }
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

  // FK config (which columns are foreign keys)
  const fkConfig = useMemo(() => detectFkConfig(table), [table]);

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

  // Load data
  const load = () => {
    setLoading(true);
    setErr('');
    api
      .get(`/${table}/`, { params: { limit: rowsPerPage, offset: page * rowsPerPage } })
      .then((res) => {
        const data = res.data || {};
        setAllRows(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => setErr(`Failed to load ${table}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, page, rowsPerPage, reloadKey]);

  // Load FK label maps (shared util+cache ensures we don't refetch unnecessarily)
  useEffect(() => {
    let mounted = true;
    async function loadFks() {
      const entries = Object.entries(fkConfig);
      if (entries.length === 0) {
        if (mounted) setFkMaps({});
        return;
      }
      const results = await Promise.all(
        entries.map(([_, cfg]) => getRefOptions(cfg.table, cfg.valueKey, cfg.labelKey))
      );
      if (!mounted) return;
      const maps = {};
      entries.forEach(([col, cfg], i) => {
        maps[col] = results[i].map; // Map<id,label>
      });
      setFkMaps(maps);
    }
    loadFks();
    return () => { mounted = false; };
  }, [fkConfig]);

  // Simple client-side search across visible columns (uses label if FK)
  useEffect(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return setRows(allRows);
    setRows(
      allRows.filter((r) =>
        columns.some((c) => {
          const val = fkMaps[c]?.get(r[c]) ?? r[c];
          return String(val ?? '').toLowerCase().includes(needle);
        })
      )
    );
  }, [q, allRows, columns, fkMaps]);

  const renderCell = (col, value) => {
    const label = fkMaps[col]?.get(value);
    if (label != null) return label; // FK friendly label
    return formatBasic(value);
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
          <Button startIcon={<AddIcon />} variant="contained" onClick={onAdd}>
            Add
          </Button>
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
                      {pretty(c)}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: 600, width: 120 }}>Actions</TableCell>
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
                        <TableCell key={c}>{renderCell(c, row[c])}</TableCell>
                      ))}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => onEdit && onEdit(row)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => onDelete && onDelete(row)}
                            sx={{ ml: 0.5 }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
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
