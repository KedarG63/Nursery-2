import { Card, CardContent, Typography, Button, Box } from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import PaymentIcon from '@mui/icons-material/Payment';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

const QuickActions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const actions = [
    {
      id: 'create-order',
      label: 'Create Order',
      icon: AddShoppingCartIcon,
      color: 'primary',
      path: '/orders/new',
      roles: ['Admin', 'Manager', 'Sales'],
    },
    {
      id: 'new-purchase',
      label: 'New Purchase',
      icon: ShoppingBagIcon,
      color: 'warning',
      path: '/purchases/new',
      roles: ['Admin', 'Manager', 'Warehouse'],
    },
    {
      id: 'record-payment',
      label: 'Payments',
      icon: PaymentIcon,
      color: 'success',
      path: '/payments',
      roles: ['Admin', 'Manager'],
    },
    {
      id: 'invoices',
      label: 'Invoices',
      icon: RequestQuoteIcon,
      color: 'secondary',
      path: '/billing/invoices',
      roles: ['Admin', 'Manager', 'Sales'],
    },
  ];

  const filteredActions = actions.filter((action) => {
    if (!user || !user.roles) return false;
    return action.roles.some((role) => user.roles.includes(role));
  });

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Quick Actions
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
          {filteredActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="contained"
                color={action.color}
                startIcon={<Icon />}
                onClick={() => navigate(action.path)}
                fullWidth
                sx={{ justifyContent: 'flex-start', py: 1 }}
              >
                {action.label}
              </Button>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
};

export default QuickActions;
