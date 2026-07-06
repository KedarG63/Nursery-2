import { useState, useEffect, useCallback } from 'react';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress, Paper, TextField, MenuItem,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Checkbox,
  IconButton, Tooltip, Chip,
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { getAttendance, bulkMarkAttendance, markAttendance, deleteAttendance } from '../../services/attendanceService';
import { getEmployees } from '../../services/employeeService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import useAuth from '../../hooks/useAuth';
import { canManageFinance } from '../../utils/roleCheck';
import ConfirmDialog from '../../components/Common/ConfirmDialog';

const todayStr = () => new Date().toISOString().split('T')[0];
const thisMonth = () => todayStr().slice(0, 7); // YYYY-MM
const monthBounds = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
};
const STATUS_UNITS = { present: 1, half_day: 0.5, paid_leave: 1, absent: 0 };

/* ─── Tab 1: Daily-wage labourer roster ─────────────────────────────────────── */
const LabourerRoster = ({ canWrite }) => {
  const { t } = useTranslation();
  const [workDate, setWorkDate] = useState(todayStr());
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getAttendance({ work_date: workDate });
      setRoster((res.data || []).map((r) => ({ ...r, status: r.status || 'present', units: r.units != null ? r.units : 1 })));
    } catch (err) { setError(err.message || 'Failed to load roster'); }
    finally { setLoading(false); }
  }, [workDate]);

  useEffect(() => { load(); }, [load]);

  const setStatus = (id, status) => setRoster((rs) => rs.map((r) => r.employee_id === id ? { ...r, status, units: STATUS_UNITS[status] ?? r.units } : r));
  const setUnits = (id, units) => setRoster((rs) => rs.map((r) => r.employee_id === id ? { ...r, units } : r));

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
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <TextField label={t('payroll.date', 'Date')} type="date" size="small" InputLabelProps={{ shrink: true }} value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
        {canWrite && roster.length > 0 && (
          <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
            {saving ? t('common.saving', 'Saving...') : t('payroll.saveAttendance', 'Save Attendance')}
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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

/* ─── Tab 2: Salaried leave log (exception-based) ───────────────────────────── */
const SalariedLeave = ({ canWrite }) => {
  const { t } = useTranslation();
  const [month, setMonth] = useState(thisMonth());
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ employee_id: '', work_date: todayStr(), leave_type: 'unpaid_leave', half_day: false });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, row: null, loading: false });

  const loadEmployees = useCallback(async () => {
    try {
      const res = await getEmployees({ employee_type: 'salaried', status: 'active', limit: 200 });
      setEmployees(res.data || []);
    } catch { /* non-fatal */ }
  }, []);

  const loadLeaves = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { from, to } = monthBounds(month);
      const res = await getAttendance({ employee_type: 'salaried', from_date: from, to_date: to });
      setLeaves(res.data || []);
    } catch (err) { setError(err.message || 'Failed to load leave'); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadLeaves(); }, [loadLeaves]);

  const submit = async () => {
    if (!form.employee_id) return toast.error(t('payroll.errEmployee', 'Select an employee'));
    setSaving(true);
    try {
      await markAttendance({
        employee_id: form.employee_id,
        work_date: form.work_date,
        status: form.leave_type,
        units: form.half_day ? 0.5 : 1,
      });
      toast.success(t('payroll.leaveRecorded', 'Leave recorded'));
      setDialog(false); loadLeaves();
    } catch (err) { toast.error(err.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setConfirm((c) => ({ ...c, loading: true }));
    try {
      await deleteAttendance(confirm.row.id);
      toast.success(t('payroll.leaveRemoved', 'Leave removed'));
      setConfirm({ open: false, row: null, loading: false });
      loadLeaves();
    } catch (err) { toast.error(err.message || 'Failed'); setConfirm((c) => ({ ...c, loading: false })); }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <TextField label={t('payroll.month', 'Month')} type="month" size="small" InputLabelProps={{ shrink: true }} value={month} onChange={(e) => setMonth(e.target.value)} />
        {canWrite && <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm({ employee_id: employees[0]?.id || '', work_date: todayStr(), leave_type: 'unpaid_leave', half_day: false }); setDialog(true); }}>{t('payroll.recordLeave', 'Record Leave')}</Button>}
      </Stack>

      <Alert severity="info" icon={<BeachAccessIcon fontSize="small" />} sx={{ mb: 2 }}>
        {t('payroll.leaveHint', 'Salaried staff are assumed present. Only record leave here — Paid leave is not deducted; Unpaid leave is deducted from salary (salary ÷ days in month per day).')}
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('payroll.date', 'Date')}</TableCell>
                <TableCell>{t('payroll.employee', 'Employee')}</TableCell>
                <TableCell>{t('payroll.leaveType', 'Leave Type')}</TableCell>
                <TableCell align="right">{t('payroll.days', 'Days')}</TableCell>
                {canWrite && <TableCell align="right"></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {leaves.length === 0 && <TableRow><TableCell colSpan={canWrite ? 5 : 4} align="center" sx={{ py: 4 }}><Typography color="text.secondary">{t('payroll.noLeave', 'No leave recorded this month')}</Typography></TableCell></TableRow>}
              {leaves.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{formatDate(r.work_date)}</TableCell>
                  <TableCell>{r.full_name} <Typography component="span" variant="caption" color="text.secondary">({r.employee_code})</Typography></TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined"
                      color={r.status === 'unpaid_leave' ? 'error' : 'success'}
                      label={r.status === 'unpaid_leave' ? t('payroll.unpaidLeave', 'Unpaid') : t('payroll.paidLeave', 'Paid')} />
                  </TableCell>
                  <TableCell align="right">{Number(r.units) === 0.5 ? t('payroll.halfDayShort', '½ day') : r.units}</TableCell>
                  {canWrite && (
                    <TableCell align="right">
                      <Tooltip title={t('common.delete', 'Delete')}><IconButton size="small" color="error" onClick={() => setConfirm({ open: true, row: r, loading: false })}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('payroll.recordLeave', 'Record Leave')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField select label={t('payroll.employee', 'Employee')} size="small" value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}>
              {employees.map((e) => <MenuItem key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</MenuItem>)}
            </TextField>
            <TextField label={t('payroll.date', 'Date')} type="date" InputLabelProps={{ shrink: true }} size="small" value={form.work_date} onChange={(e) => setForm((f) => ({ ...f, work_date: e.target.value }))} />
            <TextField select label={t('payroll.leaveType', 'Leave Type')} size="small" value={form.leave_type} onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}>
              <MenuItem value="paid_leave">{t('payroll.paidLeaveOpt', 'Paid leave (no deduction)')}</MenuItem>
              <MenuItem value="unpaid_leave">{t('payroll.unpaidLeaveOpt', 'Unpaid leave (deduct salary)')}</MenuItem>
            </TextField>
            <FormControlLabel control={<Checkbox checked={form.half_day} onChange={(e) => setForm((f) => ({ ...f, half_day: e.target.checked }))} />} label={t('payroll.halfDayLeave', 'Half day')} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>{saving ? <CircularProgress size={20} /> : t('common.save', 'Save')}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={confirm.open} title={t('payroll.removeLeave', 'Remove Leave')} message={t('payroll.removeLeaveMsg', 'Remove this leave record?')} confirmText={t('common.delete', 'Delete')} confirmColor="error" loading={confirm.loading} onConfirm={handleDelete} onCancel={() => setConfirm({ open: false, row: null, loading: false })} />
    </Box>
  );
};

/* ─── Page shell with tabs ──────────────────────────────────────────────────── */
const AttendancePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = canManageFinance(user?.roles);
  const [tab, setTab] = useState('labourers');

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
        <EventAvailableIcon sx={{ fontSize: 28, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('payroll.attendance', 'Attendance & Leave')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('payroll.attendanceSub2', 'Days worked for labourers · leave for salaried staff')}</Typography>
        </Box>
      </Stack>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="labourers" label={t('payroll.tabLabourers', 'Daily-Wage Labourers')} />
        <Tab value="salaried" label={t('payroll.tabSalariedLeave', 'Salaried Leave')} />
      </Tabs>

      {tab === 'labourers' ? <LabourerRoster canWrite={canWrite} /> : <SalariedLeave canWrite={canWrite} />}
    </Box>
  );
};

export default AttendancePage;
