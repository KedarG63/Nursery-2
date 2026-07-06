import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Button, Alert, CircularProgress, Chip, IconButton, Tooltip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper, Pagination,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Grid, InputAdornment,
  Tabs, Tab,
} from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import {
  getEmployees, createEmployee, updateEmployee, deleteEmployee,
} from '../../services/employeeService';
import { formatCurrency } from '../../utils/formatters';
import useAuth from '../../hooks/useAuth';
import { canManageFinance } from '../../utils/roleCheck';
import ConfirmDialog from '../../components/Common/ConfirmDialog';

const emptyForm = {
  full_name: '', phone: '', employee_type: 'salaried', monthly_salary: '', daily_rate: '',
  date_of_joining: '', status: 'active', bank_account_name: '', bank_account_number: '', ifsc_code: '', upi_id: '', notes: '',
};

const EmployeeDialog = ({ open, onClose, onSaved, editing }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing ? {
        full_name: editing.full_name || '', phone: editing.phone || '',
        employee_type: editing.employee_type || 'salaried',
        monthly_salary: editing.monthly_salary ?? '', daily_rate: editing.daily_rate ?? '',
        date_of_joining: editing.date_of_joining?.split('T')[0] || '', status: editing.status || 'active',
        bank_account_name: editing.bank_account_name || '', bank_account_number: editing.bank_account_number || '',
        ifsc_code: editing.ifsc_code || '', upi_id: editing.upi_id || '', notes: editing.notes || '',
      } : emptyForm);
    }
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.full_name.trim()) return toast.error(t('payroll.errName', 'Name is required'));
    if (form.employee_type === 'salaried' && !(Number(form.monthly_salary) > 0)) return toast.error(t('payroll.errSalary', 'Enter monthly salary'));
    if (form.employee_type === 'daily_wage' && !(Number(form.daily_rate) > 0)) return toast.error(t('payroll.errRate', 'Enter daily rate'));

    const payload = {
      ...form,
      monthly_salary: form.employee_type === 'salaried' ? Number(form.monthly_salary) : null,
      daily_rate: form.employee_type === 'daily_wage' ? Number(form.daily_rate) : null,
      date_of_joining: form.date_of_joining || null,
    };
    setSaving(true);
    try {
      if (editing) { await updateEmployee(editing.id, payload); toast.success(t('payroll.employeeUpdated', 'Employee updated')); }
      else { await createEmployee(payload); toast.success(t('payroll.employeeAdded', 'Employee added')); }
      onSaved();
    } catch (err) { toast.error(err.message || err.errors?.[0] || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? t('payroll.editEmployee', 'Edit Employee') : t('payroll.addEmployee', 'Add Employee')}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} sm={6}><TextField label={t('payroll.name', 'Full Name')} fullWidth size="small" value={form.full_name} onChange={set('full_name')} /></Grid>
          <Grid item xs={12} sm={6}><TextField label={t('payroll.phone', 'Phone')} fullWidth size="small" value={form.phone} onChange={set('phone')} /></Grid>
          <Grid item xs={12} sm={6}>
            <TextField select label={t('payroll.type', 'Type')} fullWidth size="small" value={form.employee_type} onChange={set('employee_type')}>
              <MenuItem value="salaried">{t('payroll.salaried', 'Salaried (monthly)')}</MenuItem>
              <MenuItem value="daily_wage">{t('payroll.dailyWage', 'Daily wage')}</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            {form.employee_type === 'salaried' ? (
              <TextField label={t('payroll.monthlySalary', 'Monthly Salary')} type="number" fullWidth size="small"
                value={form.monthly_salary} onChange={set('monthly_salary')} InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            ) : (
              <TextField label={t('payroll.dailyRate', 'Daily Rate')} type="number" fullWidth size="small"
                value={form.daily_rate} onChange={set('daily_rate')} InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
            )}
          </Grid>
          <Grid item xs={12} sm={6}><TextField label={t('payroll.joining', 'Date of Joining')} type="date" InputLabelProps={{ shrink: true }} fullWidth size="small" value={form.date_of_joining} onChange={set('date_of_joining')} /></Grid>
          <Grid item xs={12} sm={6}>
            <TextField select label={t('payroll.status', 'Status')} fullWidth size="small" value={form.status} onChange={set('status')}>
              <MenuItem value="active">{t('payroll.active', 'Active')}</MenuItem>
              <MenuItem value="inactive">{t('payroll.inactive', 'Inactive')}</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}><TextField label={t('payroll.bankName', 'Bank A/C Name')} fullWidth size="small" value={form.bank_account_name} onChange={set('bank_account_name')} /></Grid>
          <Grid item xs={12} sm={6}><TextField label={t('payroll.bankNumber', 'Bank A/C Number')} fullWidth size="small" value={form.bank_account_number} onChange={set('bank_account_number')} /></Grid>
          <Grid item xs={12} sm={6}><TextField label={t('payroll.ifsc', 'IFSC')} fullWidth size="small" value={form.ifsc_code} onChange={set('ifsc_code')} /></Grid>
          <Grid item xs={12} sm={6}><TextField label={t('payroll.upi', 'UPI ID')} fullWidth size="small" value={form.upi_id} onChange={set('upi_id')} /></Grid>
          <Grid item xs={12}><TextField label={t('payroll.notes', 'Notes')} fullWidth size="small" multiline rows={2} value={form.notes} onChange={set('notes')} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('common.cancel', 'Cancel')}</Button>
        <Button variant="contained" onClick={submit} disabled={saving}>{saving ? <CircularProgress size={20} /> : t('common.save', 'Save')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const EmployeesPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite = canManageFinance(user?.roles);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [typeFilter, setTypeFilter] = useState('salaried');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [confirm, setConfirm] = useState({ open: false, row: null, loading: false });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (typeFilter) params.employee_type = typeFilter;
      const res = await getEmployees(params);
      setRows(res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch (err) { setError(err.message || 'Failed to load employees'); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, typeFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch, typeFilter]);

  const handleDelete = async () => {
    setConfirm((c) => ({ ...c, loading: true }));
    try {
      await deleteEmployee(confirm.row.id);
      toast.success(t('payroll.employeeDeleted', 'Employee deleted'));
      setConfirm({ open: false, row: null, loading: false });
      load();
    } catch (err) { toast.error(err.message || 'Failed'); setConfirm((c) => ({ ...c, loading: false })); }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <GroupsIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('payroll.employees', 'Employees')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('payroll.employeesSub', 'Salaried staff and daily-wage workers')}</Typography>
          </Box>
        </Stack>
        {canWrite && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, editing: null })}>{t('payroll.addEmployee', 'Add Employee')}</Button>}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs
        value={typeFilter}
        onChange={(e, v) => setTypeFilter(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="salaried" label={t('payroll.tabSalaried', 'Salaried Employees')} />
        <Tab value="daily_wage" label={t('payroll.tabLabourers', 'Daily-Wage Labourers')} />
      </Tabs>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField label={t('common.search', 'Search')} size="small" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 240 }} />
        </Stack>
      </Paper>

      {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('payroll.code', 'Code')}</TableCell>
                <TableCell>{t('payroll.name', 'Name')}</TableCell>
                <TableCell>{t('payroll.type', 'Type')}</TableCell>
                <TableCell align="right">{t('payroll.pay', 'Salary / Rate')}</TableCell>
                <TableCell align="right">{t('payroll.outstandingAdvance', 'Outstanding Advance')}</TableCell>
                <TableCell>{t('payroll.status', 'Status')}</TableCell>
                {canWrite && <TableCell align="right">{t('common.actions', 'Actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={canWrite ? 7 : 6} align="center" sx={{ py: 4 }}><Typography color="text.secondary">{t('payroll.noEmployees', 'No employees yet')}</Typography></TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.employee_code}</TableCell>
                  <TableCell>
                    <Typography
                      component="span"
                      sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => navigate(`/payroll/employees/${r.id}`)}
                    >
                      {r.full_name}
                    </Typography>
                  </TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={r.employee_type === 'salaried' ? 'primary' : 'secondary'} label={r.employee_type === 'salaried' ? t('payroll.salaried', 'Salaried') : t('payroll.dailyWage', 'Daily wage')} /></TableCell>
                  <TableCell align="right">{r.employee_type === 'salaried' ? `${formatCurrency(r.monthly_salary)}/mo` : `${formatCurrency(r.daily_rate)}/day`}</TableCell>
                  <TableCell align="right">{Number(r.outstanding_advance) > 0 ? <Typography color="warning.main" fontWeight={600}>{formatCurrency(r.outstanding_advance)}</Typography> : '-'}</TableCell>
                  <TableCell><Chip size="small" label={r.status} color={r.status === 'active' ? 'success' : 'default'} /></TableCell>
                  {canWrite && (
                    <TableCell align="right">
                      <Tooltip title={t('common.edit', 'Edit')}><IconButton size="small" onClick={() => setDialog({ open: true, editing: r })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title={t('common.delete', 'Delete')}><IconButton size="small" color="error" onClick={() => setConfirm({ open: true, row: r, loading: false })}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {totalPages > 1 && <Box display="flex" justifyContent="center" mt={2}><Pagination count={totalPages} page={page} onChange={(e, v) => setPage(v)} color="primary" /></Box>}

      <EmployeeDialog open={dialog.open} editing={dialog.editing} onClose={() => setDialog({ open: false, editing: null })} onSaved={() => { setDialog({ open: false, editing: null }); load(); }} />
      <ConfirmDialog open={confirm.open} title={t('payroll.deleteEmployee', 'Delete Employee')} message={t('payroll.deleteEmployeeMsg', 'Remove this employee?')} confirmText={t('common.delete', 'Delete')} confirmColor="error" loading={confirm.loading} onConfirm={handleDelete} onCancel={() => setConfirm({ open: false, row: null, loading: false })} />
    </Box>
  );
};

export default EmployeesPage;
