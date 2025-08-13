import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { getRefOptions } from '../../utils/refData';

/**
 * RJSF custom widget for foreign keys.
 * Expects uiSchema to pass:
 * {
 *   'ui:widget': 'RefSelect',
 *   'ui:options': {
 *     ref: { table: 'users', value: 'id', label: 'email' }
 *   }
 * }
 */
export default function RefSelect(props) {
  const {
    id,
    label,
    required,
    disabled,
    readonly,
    value,           // current id string
    onChange,
    options = {},
    schema,
    rawErrors,
  } = props;

  const refCfg = options?.ref || {};
  const table = refCfg.table;
  const valueKey = refCfg.value || 'id';
  const labelKey = refCfg.label || 'name';

  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!table) return;
      setLoading(true);
      try {
        const { opts } = await getRefOptions(table, valueKey, labelKey);
        if (mounted) setOpts(opts);
      } catch {
        if (mounted) setOpts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [table, valueKey, labelKey]);

  const selectedOption = useMemo(
    () => opts.find((o) => o.value === value) || null,
    [opts, value]
  );

  return (
    <Autocomplete
      id={id}
      size="small"
      disabled={disabled || readonly}
      options={opts}
      value={selectedOption}
      loading={loading}
      onChange={(_, newVal) => onChange(newVal ? newVal.value : undefined)}
      getOptionLabel={(o) => (o?.label ? String(o.label) : '')}
      isOptionEqualToValue={(o, v) => o?.value === v?.value}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label || schema?.title || id}
          required={required}
          error={Array.isArray(rawErrors) && rawErrors.length > 0}
          helperText={Array.isArray(rawErrors) && rawErrors.length > 0 ? rawErrors[0] : ''}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress size={18} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      clearOnEscape
      autoHighlight
    />
  );
}
