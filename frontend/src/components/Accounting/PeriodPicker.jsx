import { useState } from 'react';
import { Stack, TextField, MenuItem, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Indian financial year: April 1 → March 31.
export const periodRange = (preset) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'all_time':
      return { from_date: null, to_date: null };
    case 'last_month':
      return { from_date: fmt(new Date(y, m - 1, 1)), to_date: fmt(new Date(y, m, 0)) };
    case 'this_fy': {
      const start = m >= 3 ? y : y - 1;
      return { from_date: `${start}-04-01`, to_date: `${start + 1}-03-31` };
    }
    case 'last_fy': {
      const start = (m >= 3 ? y : y - 1) - 1;
      return { from_date: `${start}-04-01`, to_date: `${start + 1}-03-31` };
    }
    case 'this_month':
    default:
      return { from_date: fmt(new Date(y, m, 1)), to_date: fmt(new Date(y, m + 1, 0)) };
  }
};

/**
 * Period selector shared by the Finance Overview, P&L and report pages.
 * Calls onChange({ from_date, to_date }) whenever the window changes.
 * With allowAllTime, adds an "All Time" preset that emits null dates.
 */
const PeriodPicker = ({ value, onChange, allowAllTime = false, defaultPreset = 'this_month' }) => {
  const { t } = useTranslation();
  const [preset, setPreset] = useState(defaultPreset);
  const [custom, setCustom] = useState(value || periodRange(defaultPreset));

  const handlePreset = (p) => {
    setPreset(p);
    if (p !== 'custom') {
      const range = periodRange(p);
      setCustom(p === 'all_time' ? periodRange('this_month') : range);
      onChange(range);
    }
  };

  const handleCustom = (field, val) => {
    const next = { ...custom, [field]: val };
    setCustom(next);
    if (next.from_date && next.to_date && next.from_date <= next.to_date) onChange(next);
  };

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
      <TextField select size="small" value={preset} onChange={(e) => handlePreset(e.target.value)} sx={{ minWidth: 170 }}>
        {allowAllTime && <MenuItem value="all_time">{t('finance.allTime', 'All Time')}</MenuItem>}
        <MenuItem value="this_month">{t('finance.thisMonth', 'This Month')}</MenuItem>
        <MenuItem value="last_month">{t('finance.lastMonth', 'Last Month')}</MenuItem>
        <MenuItem value="this_fy">{t('finance.thisFY', 'This Financial Year')}</MenuItem>
        <MenuItem value="last_fy">{t('finance.lastFY', 'Last Financial Year')}</MenuItem>
        <MenuItem value="custom">{t('finance.custom', 'Custom Range')}</MenuItem>
      </TextField>
      {preset === 'custom' && (
        <>
          <TextField size="small" type="date" label={t('finance.from', 'From')} InputLabelProps={{ shrink: true }}
            value={custom.from_date} onChange={(e) => handleCustom('from_date', e.target.value)} />
          <TextField size="small" type="date" label={t('finance.to', 'To')} InputLabelProps={{ shrink: true }}
            value={custom.to_date} onChange={(e) => handleCustom('to_date', e.target.value)} />
        </>
      )}
    </Stack>
  );
};

export default PeriodPicker;
