import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Breadcrumbs, Link, CircularProgress, Chip, Stack,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Person as PersonIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { getEmployee } from '../../services/employeeService';
import { getEmployeeSummary } from '../../services/partySummaryService';
import PartySummary360 from '../../components/Accounting/PartySummary360';
import { formatCurrency } from '../../utils/formatters';

const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getEmployee(id);
        setEmp(res.data || res);
      } catch (err) {
        toast.error('Failed to load employee');
        navigate('/payroll/employees');
      } finally { setLoading(false); }
    })();
  }, [id, navigate]);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4 }}><Box display="flex" justifyContent="center" minHeight={300} alignItems="center"><CircularProgress /></Box></Container>;
  if (!emp) return null;

  const isSalaried = emp.employee_type === 'salaried';

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/payroll/employees" underline="hover" color="inherit">{t('nav.employees', 'Employees')}</Link>
        <Typography color="text.primary">{emp.full_name}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/payroll/employees')} variant="outlined">{t('common.back', 'Back')}</Button>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <PersonIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography variant="h4">{emp.full_name}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">{emp.employee_code}</Typography>
                <Chip size="small" variant="outlined" color={isSalaried ? 'primary' : 'secondary'} label={isSalaried ? `${formatCurrency(emp.monthly_salary)}/mo` : `${formatCurrency(emp.daily_rate)}/day`} />
                <Chip size="small" label={emp.status} color={emp.status === 'active' ? 'success' : 'default'} />
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </Box>

      <PartySummary360
        fetchSummary={(params) => getEmployeeSummary(id, params)}
        kpis={[
          { key: 'net_paid', label: t('summary.netPaid', 'Net Paid'), color: '#2e7d32' },
          { key: 'gross', label: t('summary.gross', 'Gross'), color: '#1976d2' },
          { key: 'advances_given', label: t('summary.advancesGiven', 'Advances'), color: '#ed6c02' },
          { key: 'outstanding_advance', label: t('summary.advanceDue', 'Advance Due'), color: '#c62828' },
          { key: 'days_worked', label: t('summary.daysWorked', 'Days Worked'), color: '#1A3329', raw: true },
        ]}
        seriesBars={[
          { key: 'paid', label: t('summary.netPaid', 'Net Paid'), color: '#2e7d32' },
          { key: 'advance', label: t('summary.advancesGiven', 'Advances'), color: '#ed6c02' },
        ]}
        txTypeColors={{ payout: 'success', advance: 'warning' }}
      />
    </Container>
  );
};

export default EmployeeDetails;
