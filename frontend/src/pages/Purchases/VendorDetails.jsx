import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Breadcrumbs, Link, CircularProgress, Chip, Stack,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Storefront as StorefrontIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import vendorService from '../../services/vendorService';
import { getVendorSummary } from '../../services/partySummaryService';
import PartySummary360 from '../../components/Accounting/PartySummary360';

const VendorDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await vendorService.getVendorById(id);
        setVendor(res.data || res);
      } catch (err) {
        toast.error('Failed to load vendor');
        navigate('/purchases/vendors');
      } finally { setLoading(false); }
    })();
  }, [id, navigate]);

  if (loading) return <Container maxWidth="xl" sx={{ mt: 4 }}><Box display="flex" justifyContent="center" minHeight={300} alignItems="center"><CircularProgress /></Box></Container>;
  if (!vendor) return null;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/purchases/vendors" underline="hover" color="inherit">{t('nav.vendors', 'Vendors')}</Link>
        <Typography color="text.primary">{vendor.vendor_name}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/purchases/vendors')} variant="outlined">{t('common.back', 'Back')}</Button>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <StorefrontIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography variant="h4">{vendor.vendor_name}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">{vendor.vendor_code}</Typography>
                {vendor.phone && <Typography variant="body2" color="text.secondary">• {vendor.phone}</Typography>}
                {vendor.status && <Chip size="small" label={vendor.status} color={vendor.status === 'active' ? 'success' : 'default'} />}
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </Box>

      <PartySummary360
        fetchSummary={(params) => getVendorSummary(id, params)}
        kpis={[
          { key: 'purchase_count', label: t('summary.purchases', 'Purchases'), color: '#1A3329', raw: true },
          { key: 'purchased', label: t('summary.purchased', 'Purchased'), color: '#1976d2' },
          { key: 'paid', label: t('summary.paid', 'Paid'), color: '#2e7d32' },
          { key: 'expenses', label: t('summary.expenses', 'Expenses'), color: '#ed6c02' },
          { key: 'total_outstanding', label: t('summary.outstanding', 'Outstanding'), color: '#c62828' },
        ]}
        seriesBars={[
          { key: 'purchased', label: t('summary.purchased', 'Purchased'), color: '#1976d2' },
          { key: 'paid', label: t('summary.paid', 'Paid'), color: '#2e7d32' },
        ]}
        txTypeColors={{ purchase: 'primary', payment: 'success', expense: 'warning' }}
      />
    </Container>
  );
};

export default VendorDetails;
