import { Card, CardContent, Typography, Box } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

const KPICard = ({ title, value, icon: Icon, color = 'primary', trend, format = 'number' }) => {
  const formatValue = (val) => {
    if (format === 'currency') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
      }).format(val);
    }
    return val;
  };

  return (
    <Card
      sx={{
        height: '100%',
        background: `linear-gradient(135deg, ${color === 'primary' ? '#4caf50' : color === 'secondary' ? '#ff9800' : color === 'info' ? '#2196f3' : '#9c27b0'} 0%, ${color === 'primary' ? '#388e3c' : color === 'secondary' ? '#f57c00' : color === 'info' ? '#1976d2' : '#7b1fa2'} 100%)`,
        color: '#fff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" sx={{ opacity: 0.9, mb: 1 }}>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight="bold">
              {formatValue(value)}
            </Typography>
            {trend && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                {trend > 0 ? (
                  <TrendingUpIcon fontSize="small" />
                ) : (
                  <TrendingDownIcon fontSize="small" />
                )}
                <Typography variant="body2" sx={{ ml: 0.5 }}>
                  {Math.abs(trend)}%
                </Typography>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: 2,
              p: 1.5,
            }}
          >
            <Icon sx={{ fontSize: 40 }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default KPICard;
