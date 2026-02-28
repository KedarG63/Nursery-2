/**
 * Payment Summary Component
 * Displays payment summary KPI cards
 */

import { Grid, Card, CardContent, Typography, Box } from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  HourglassEmpty as PendingIcon,
  Warning as OverdueIcon,
  CreditCard as CreditIcon,
} from '@mui/icons-material';

const PaymentSummary = ({ summary }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const cards = [
    {
      title: 'Total Paid',
      value: formatCurrency(summary?.total_paid),
      icon: <MoneyIcon />,
      color: '#4caf50',
      bgColor: '#e8f5e9',
    },
    {
      title: 'Pending',
      value: formatCurrency(summary?.pending),
      icon: <PendingIcon />,
      color: '#ff9800',
      bgColor: '#fff3e0',
    },
    {
      title: 'Overdue',
      value: formatCurrency(summary?.overdue),
      icon: <OverdueIcon />,
      color: '#f44336',
      bgColor: '#ffebee',
    },
    {
      title: 'Credit Used',
      value: formatCurrency(summary?.credit_used),
      icon: <CreditIcon />,
      color: '#2196f3',
      bgColor: '#e3f2fd',
    },
  ];

  return (
    <Grid container spacing={3}>
      {cards.map((card, index) => (
        <Grid item xs={12} sm={6} md={3} key={index}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    bgcolor: card.bgColor,
                    color: card.color,
                    mr: 2,
                  }}
                >
                  {card.icon}
                </Box>
                <Typography variant="h6" component="div" color={card.color}>
                  {card.value}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {card.title}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default PaymentSummary;
