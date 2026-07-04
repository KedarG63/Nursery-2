import { useState, useEffect, useCallback } from 'react';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress, Paper, TextField, MenuItem,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import SaveIcon from '@mui/icons-material/Save';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { getAttendance, bulkMarkAttendance } from '../../services/attendanceService';
import { formatCurrency } from '../../utils/formatters';
import useAuth from '../../hooks/useAuth';
import { canManageFinance } from '../../utils/roleCheck';

const todayStr = () => new Date().toISOString().split('T')[0];
const STATUS_UNITS = { present: 1, half_day: 0.5, paid_leave: 1, absent: 0 };

const AttendancePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = canManageFinance(user?.roles);

  const [workDate, setWorkDate] = useState(todayStr());
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getAttendance({ work_date: workDate });
      setRoster((res.data || []).map((r) => ({
        ...r,
        status: r.status || 'present',
        units: r.units != null ? r.units : 1,
      })));
    } catch (err) { setError(err.message || 'Failed to load roster'); }
    finally { setLoading(false); }
  }, [workDate]);

  useEffect(() => { load(); }, [load]);

  const setStatus = (employee_id, status) => {
    setRoster((rs) => rs.map((r) => r.employee_id === employee_id ? { ...r, status, units: STATUS_UNITS[status] ?? r.units } : r));
  };
  const setUnits = (employee_id, units) => {
    setRoster((rs) => rs.map((r) => r.employee_id === employee_id ? { ...r, units } : r));
  };

  const save = async () => {
    setSaving(true);
    try {
      const entries = roster.map((r) => ({ employee_id: r.employee_id, status: r.status, units: Number(r.units) }));
      const res = await bulkMarkAttendance({ work_date: workDate, entries });
      toast.success(res.message || t('payroll.attendanceSaved', 'Attendance saved'));
      load();
    } catch (err) { toast.error(err.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <EventAvailableIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('payroll.attendance', 'Daily Attendance')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('payroll.attendanceSub', 'Mark days worked for daily-wage workers')}</Typography>
          </Box>
        </Stack>
        {canWrite && roster.length > 0 && (
          <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>{saving ? t('common.saving', 'Saving...') : t('payroll.saveAttendance', 'Save Attendance')}</Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField label={t('payroll.date', 'Date')} type="date" size="small" InputLabelProps={{ shrink: true }} value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
      </Paper>

      {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('payroll.code', 'Code')}</TableCell>
                <TableCell>{t('payroll.name', 'Name')}</TableCell>
                <TableCell align="right">{t('payroll.dailyRate', 'Daily Rate')}</TableCell>
                <TableCell>{t('payroll.attStatus', 'Attendance')}</TableCell>
                <TableCell align="right">{t('payroll.units', 'Units (days)')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roster.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><Typography color="text.secondary">{t('payroll.noWorkers', 'No active daily-wage workers. Add them under Employees.')}</Typography></TableCell></TableRow>}
              {roster.map((r) => (
                <TableRow key={r.employee_id} hover>
                  <TableCell>{r.employee_code}</TableCell>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell align="right">{formatCurrency(r.daily_rate)}</TableCell>
                  <TableCell>
                    <TextField select size="small" value={r.status} onChange={(e) => setStatus(r.employee_id, e.target.value)} disabled={!canWrite} sx={{ minWidth: 140 }}>
                      <MenuItem value="present">{t('payroll.present', 'Present')}</MenuItem>
                      <MenuItem value="half_day">{t('payroll.halfDay', 'Half day')}</MenuItem>
                      <MenuItem value="paid_leave">{t('payroll.paidLeave', 'Paid leave')}</MenuItem>
                      <MenuItem value="absent">{t('payroll.absent', 'Absent')}</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell align="right">
                    <TextField type="number" size="small" value={r.units} onChange={(e) => setUnits(r.employee_id, e.target.value)} disabled={!canWrite} sx={{ width: 90 }} inputProps={{ step: 0.5, min: 0 }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default AttendancePage;
