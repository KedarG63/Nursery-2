import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#4A7C59',
      light: '#7AAB8A',
      dark: '#2E5D44',
      contrastText: '#fff',
    },
    secondary: {
      main: '#B8714A',
      light: '#D4956F',
      dark: '#8F5234',
      contrastText: '#fff',
    },
    error: { main: '#C0392B' },
    warning: { main: '#D4A853' },
    info: { main: '#2E7D9A' },
    success: { main: '#4A7C59' },
    background: {
      default: '#F6F8F4',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A2E1A',
      secondary: '#3D5440',
      disabled: '#7A9282',
    },
    divider: '#D9E8DC',
  },

  typography: {
    fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: '2.25rem', fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.02em', fontFamily: '"Lora", Georgia, serif' },
    h2: { fontSize: '1.875rem', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.015em', fontFamily: '"Lora", Georgia, serif' },
    h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em', fontFamily: '"Lora", Georgia, serif' },
    h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.005em' },
    h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
    subtitle1: { fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.5 },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.5, textTransform: 'uppercase', letterSpacing: '0.06em' },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', lineHeight: 1.5 },
    button: { fontWeight: 600, letterSpacing: '0.01em' },
  },

  shape: { borderRadius: 10 },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#F6F8F4' },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          fontSize: '0.9rem',
          padding: '8px 20px',
        },
        contained: {
          boxShadow: '0 2px 6px rgba(74,124,89,0.28)',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(74,124,89,0.38)',
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': { borderWidth: '1.5px' },
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(26,51,41,0.08)',
          borderRadius: 12,
          border: '1px solid rgba(217,232,220,0.6)',
          backgroundImage: 'none',
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        elevation1: { boxShadow: '0 2px 8px rgba(26,51,41,0.08)' },
        elevation2: { boxShadow: '0 4px 12px rgba(26,51,41,0.10)' },
        elevation3: { boxShadow: '0 6px 20px rgba(26,51,41,0.12)' },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '&.Mui-focused': {
              boxShadow: '0 0 0 3px rgba(74,124,89,0.14)',
            },
          },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#C8DACA' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#8BB89A' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#4A7C59',
            borderWidth: '2px',
          },
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1A3329',
          color: '#E8F0E8',
          border: 'none',
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#1A2E1A',
          boxShadow: '0 1px 0 rgba(217,232,220,0.9)',
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          fontSize: '0.8rem',
        },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#F6F8F4',
            fontWeight: 700,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#3D5440',
            borderBottom: '2px solid #D9E8DC',
          },
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: 'rgba(235,242,237,0.5)' },
          '& .MuiTableCell-root': { borderBottom: '1px solid rgba(217,232,220,0.5)' },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10, border: '1px solid' },
        standardSuccess: { borderColor: 'rgba(74,124,89,0.3)', backgroundColor: '#EBF2ED' },
        standardInfo: { borderColor: 'rgba(46,125,154,0.3)', backgroundColor: '#E5F2F7' },
        standardWarning: { borderColor: 'rgba(212,168,83,0.3)', backgroundColor: '#FDF7EB' },
        standardError: { borderColor: 'rgba(192,57,43,0.3)', backgroundColor: '#FDECEA' },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '1px 8px',
          padding: '9px 12px',
          width: 'calc(100% - 16px)',
          transition: 'all 0.15s ease',
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: '#D9E8DC' },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.9rem',
        },
      },
    },
  },
});

export default theme;
