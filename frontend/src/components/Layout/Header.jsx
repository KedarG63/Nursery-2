import { AppBar, Toolbar, Typography, IconButton, Box } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';

const Header = ({ onMenuClick, onDesktopMenuClick }) => {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: '#fff',
        color: '#1A2E1A',
        borderBottom: '1px solid rgba(217,232,220,0.8)',
        boxShadow: 'none',
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
        {/* Mobile menu toggle */}
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={onMenuClick}
          sx={{ mr: 1.5, display: { xs: 'flex', md: 'none' }, color: '#3D5440' }}
        >
          <MenuIcon />
        </IconButton>

        {/* Desktop menu toggle */}
        <IconButton
          color="inherit"
          aria-label="toggle drawer"
          edge="start"
          onClick={onDesktopMenuClick}
          sx={{ mr: 1.5, display: { xs: 'none', md: 'flex' }, color: '#3D5440' }}
        >
          <MenuIcon />
        </IconButton>

        {/* Brand */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{
            width: 28, height: 28,
            backgroundColor: '#EBF2ED',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 22C12 22 11 18 8 14C5 10 3 8 3 6C3 4 5 2 8 2C10 2 11.5 3 12 4C12.5 3 14 2 16 2C19 2 21 4 21 6C21 8 19 10 16 14C13 18 12 22 12 22Z" fill="#4A7C59"/>
            </svg>
          </Box>
          <Typography
            noWrap
            sx={{
              fontFamily: '"Lora", Georgia, serif',
              fontWeight: 600,
              fontSize: { xs: '0.95rem', sm: '1.05rem' },
              color: '#1A2E1A',
              letterSpacing: '0.005em',
            }}
          >
            Vasundhara Seedlings
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
