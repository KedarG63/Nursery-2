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
              <path d="M12 20.5 C11.7 16.5 12.3 12.5 12 5.5" stroke="#4A7C59" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M8.5 20.5 L15.5 20.5" stroke="#4A7C59" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M12 15.5 C9.5 14.5 7 12 6.5 9 C9.5 8.5 12 11.5 12 15.5Z" fill="#4A7C59"/>
              <path d="M12 11.5 C14.5 10.5 17 8 17.5 5 C14.5 4.5 12 7.5 12 11.5Z" fill="#4A7C59"/>
              <circle cx="12" cy="4" r="1.4" fill="#4A7C59"/>
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
