// src/components/SchemaNavigation.jsx
import React, { useMemo } from 'react';
import { getGroups, allDefinitions, entityTitle } from '../schemaRegistry';
import {
  Breadcrumbs as MUIBreadcrumbs,
  Link as MUILink,
  Typography,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Box,
} from '@mui/material';

export default function SchemaNavigation({ currentEntity, onChangeEntity }) {
  const groups = useMemo(() => getGroups(), []);
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);

  const activeGroup = useMemo(() => {
    return groups.find((g) => g.entities.includes(currentEntity))?.id || groupIds[0];
  }, [groups, groupIds, currentEntity]);

  const entitiesInActive = useMemo(() => {
    return groups.find((g) => g.id === activeGroup)?.entities || [];
  }, [groups, activeGroup]);

  const entityLabel = useMemo(() => entityTitle(currentEntity), [currentEntity]);

  return (
    <Stack spacing={1} sx={{ mb: 2 }}>
      <MUIBreadcrumbs aria-label="breadcrumb" sx={{ '& a': { textDecoration: 'none' } }}>
        <MUILink
          component="button"
          type="button"
          underline="hover"
          color="inherit"
          onClick={() => onChangeEntity(entitiesInActive?.[0] || currentEntity)}
        >
          Home
        </MUILink>
        {activeGroup && <Typography color="text.secondary">{groups.find(g => g.id === activeGroup)?.label}</Typography>}
        <Typography color="text.primary">{entityLabel}</Typography>
      </MUIBreadcrumbs>

      {/* Group selector (if more than one group) */}
      {groupIds.length > 1 && (
        <Box sx={{ overflowX: 'auto' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={activeGroup}
            onChange={(_, next) => {
              if (!next) return;
              const first = groups.find((g) => g.id === next)?.entities?.[0];
              if (first) onChangeEntity(first);
            }}
            sx={{ display: 'inline-flex', px: 0.5, mb: 0.5, '& .MuiToggleButton-root': { textTransform: 'none' } }}
          >
            {groups.map((g) => (
              <ToggleButton key={g.id} value={g.id} aria-label={g.id}>
                {g.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Entity selector within active group */}
      {entitiesInActive.length > 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={currentEntity}
            onChange={(_, next) => next && onChangeEntity(next)}
            sx={{ display: 'inline-flex', px: 0.5, '& .MuiToggleButton-root': { textTransform: 'none' } }}
          >
            {entitiesInActive.map((k) => (
              <ToggleButton key={k} value={k} aria-label={k}>
                {allDefinitions?.[k]?.title || (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '))}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}
    </Stack>
  );
}
