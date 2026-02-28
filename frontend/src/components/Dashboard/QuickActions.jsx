import { Card, CardContent, Typography, Button, Box } from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import AddBoxIcon from '@mui/icons-material/AddBox';
import RouteIcon from '@mui/icons-material/Route';
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
      id: 'add-lot',
      label: 'Add Lot',
      icon: AddBoxIcon,
      color: 'secondary',
      path: '/inventory/lots/new',
      roles: ['Admin', 'Manager', 'Warehouse'],
    },
    {
      id: 'view-routes',
      label: 'View Routes',
      icon: RouteIcon,
      color: 'info',
      path: '/deliveries/routes',
      roles: ['Admin', 'Manager', 'Delivery'],
    },
  ];

  // Filter actions based on user roles
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
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
          {filteredActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="contained"
                color={action.color}
                startIcon={<Icon />}
                onClick={() => navigate(action.path)}
                sx={{ flexGrow: 1 }}
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
