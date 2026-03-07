import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Divider,
  Button,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { logout } from '../../store/authSlice';
import useAuth from '../../hooks/useAuth';
import menuItems from '../../config/menuItems';

const drawerWidth = 240;

const Sidebar = ({ mobileOpen, desktopOpen, onDrawerToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { user } = useAuth();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleNavigation = (path) => {
    navigate(path);
    if (mobileOpen) onDrawerToggle();
  };

  const filteredMenuItems = menuItems.filter((item) => {
    if (!user || !user.roles) return false;
    if (item.hidden) return false;
    return item.roles.some((role) => user.roles.includes(role));
  });

  const drawerContent = (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1A3329',
      color: '#E8F0E8',
    }}>
      {/* User info */}
      <Box sx={{ px: 2.5, pt: 10, pb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: '50%',
            backgroundColor: 'rgba(139,184,154,0.2)',
            border: '1.5px solid rgba(139,184,154,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Typography sx={{
              fontSize: '0.85rem', fontWeight: 700,
              color: '#8BB89A', lineHeight: 1,
            }}>
              {(user?.fullName || user?.email || 'U').charAt(0).toUpperCase()}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{
              fontSize: '0.875rem', fontWeight: 600,
              color: '#E8F0E8', lineHeight: 1.2,
            }}>
              {user?.fullName || user?.email || 'User'}
            </Typography>
            <Typography noWrap sx={{
              fontSize: '0.72rem', color: 'rgba(200,225,208,0.6)',
              textTransform: 'capitalize', lineHeight: 1.4,
            }}>
              {user?.roles?.join(', ') || 'User'}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider sx={{ borderColor: 'rgba(139,184,154,0.15)', mx: 2 }} />

      {/* Navigation */}
      <List sx={{ flexGrow: 1, pt: 1.5, pb: 1 }}>
        {filteredMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path + '/'));

          return (
            <ListItem key={item.id} disablePadding sx={{ display: 'block' }}>
              <ListItemButton
                onClick={() => handleNavigation(item.path)}
                selected={isActive}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  mb: 0.5,
                  py: 1,
                  px: 1.5,
                  width: 'auto',
                  transition: 'all 0.15s ease',
                  '&.Mui-selected': {
                    backgroundColor: '#2E5D44',
                    borderLeft: '4px solid #8DD4A0',
                    pl: '8px',
                    '&:hover': { backgroundColor: '#356A4F' },
                  },
                  '&:not(.Mui-selected):hover': {
                    backgroundColor: 'rgba(255,255,255,0.07)',
                  },
                }}
              >
                <ListItemIcon sx={{
                  minWidth: 36,
                  color: isActive ? '#8DD4A0' : 'rgba(232,240,232,0.7)',
                  transition: 'color 0.15s ease',
                  '& svg': { fontSize: '1.15rem' },
                }}>
                  <Icon />
                </ListItemIcon>
                <ListItemText
                  primary={t(item.labelKey)}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#FFFFFF' : 'rgba(232,240,232,0.82)',
                    transition: 'all 0.15s ease',
                    letterSpacing: isActive ? '0.01em' : 'normal',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(139,184,154,0.15)', mx: 2 }} />

      {/* Logout */}
      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<LogoutIcon sx={{ fontSize: '1rem !important' }} />}
          onClick={handleLogout}
          size="small"
          sx={{
            color: 'rgba(200,225,208,0.7)',
            borderColor: 'rgba(139,184,154,0.25)',
            fontSize: '0.85rem',
            py: 0.9,
            '&:hover': {
              borderColor: 'rgba(139,184,154,0.5)',
              backgroundColor: 'rgba(139,184,154,0.08)',
              color: '#C8E6CC',
            },
          }}
        >
          Sign Out
        </Button>
      </Box>
    </Box>
  );

  return (
    <>
      {/* Mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop */}
      <Drawer
        variant="persistent"
        open={desktopOpen}
        sx={{
          display: { xs: 'none', md: 'block' },
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
};

export default Sidebar;
