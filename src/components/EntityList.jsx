import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import {
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Typography, Box, CircularProgress
} from '@mui/material';
import schemaV2 from './schema_v2.json';

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
    })
    .slice(0, 6);
  if (!keys.includes('id') && props.id) keys.unshift('id'); // keep id visible first if present
  return keys;
}

const toLabel = (k) => k.charAt(0).toUpperCase() + k.slice(1);

export default function EntityList({ table, onSelect, selectedId, reloadKey }) {
  const columns = useMemo(() => inferColumns(table), [table]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRpp] = useState(10);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr('');
    api
      .get(`/${table}/`, { params: { limit: rowsPerPage, offset: page * rowsPerPage } })
      .then((res) => {
        if (!mounted) return;
        const data = res.data || {};
        setRows(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        if (!mounted) return;
        setErr(`Failed to load ${table}`);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [table, page, rowsPerPage, reloadKey]);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {toLabel(table)} — {total} record{total === 1 ? '' : 's'}
      </Typography>

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
                      {toLabel(c)}
                    </TableCell>
                  ))}
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
                          {typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c] ?? '')}
                        </TableCell>
                      ))}
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
