import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Box, Toolbar } from '@mui/material';
import Header from './Header';
import Sidebar from './Sidebar';

const drawerWidth = 240;

const AppLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleDesktopToggle = () => {
    setDesktopOpen(!desktopOpen);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Header onMenuClick={handleDrawerToggle} onDesktopMenuClick={handleDesktopToggle} />
      <Sidebar
        mobileOpen={mobileOpen}
        desktopOpen={desktopOpen}
        onDrawerToggle={handleDrawerToggle}
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          minHeight: '100vh',
          backgroundColor: '#f5f5f5',
          transition: 'margin 225ms cubic-bezier(0.4, 0, 0.6, 1) 0ms',
          ml: { xs: 0, md: desktopOpen ? 0 : `-${drawerWidth}px` },
          width: '100%',
        }}
      >
        <Toolbar /> {/* Spacer for fixed header */}
        <Outlet />
      </Box>
    </Box>
  );
};

export default AppLayout;
