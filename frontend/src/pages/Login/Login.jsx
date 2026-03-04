import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { loginRequest, loginSuccess, loginFailure } from '../../store/authSlice';
import authService from '../../services/authService';
import useAuth from '../../hooks/useAuth';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const SaplingSVG = () => (
  <svg viewBox="0 0 400 500" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ width: '100%', maxWidth: 340, opacity: 0.2 }}>
    {/* Main trunk — gentle S-curve */}
    <path d="M200 468 C198 420 203 368 200 308 C197 248 202 188 199 128 C197 88 200 58 200 48"
      stroke="#A8D5B5" strokeWidth="3.5" strokeLinecap="round"/>
    {/* Ground line */}
    <path d="M158 470 C176 466 224 466 242 470"
      stroke="#8BB89A" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
    {/* Roots */}
    <path d="M200 462 C188 466 172 470 160 477" stroke="#7AAB8A" strokeWidth="1.8" strokeLinecap="round" opacity="0.5"/>
    <path d="M200 462 C212 466 228 470 240 477" stroke="#7AAB8A" strokeWidth="1.8" strokeLinecap="round" opacity="0.5"/>
    <path d="M200 462 C200 470 199 478 198 486" stroke="#7AAB8A" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
    {/* Leaf pair 1 — lowest, widest (y≈380) */}
    <path d="M200 392 C200 392 148 372 118 330 C95 297 108 265 140 272 C172 279 200 350 200 392Z" fill="#7AAB8A"/>
    <path d="M200 372 C200 372 252 352 282 310 C305 277 292 245 260 252 C228 259 200 330 200 372Z" fill="#5E8F6D"/>
    {/* Leaf pair 2 (y≈298) */}
    <path d="M200 308 C200 308 156 292 132 256 C112 228 124 202 152 210 C180 218 200 274 200 308Z" fill="#8BB89A"/>
    <path d="M200 290 C200 290 244 274 268 238 C288 210 276 184 248 192 C220 200 200 256 200 290Z" fill="#6FA080"/>
    {/* Leaf pair 3 (y≈220) */}
    <path d="M200 228 C200 228 163 213 142 183 C124 157 134 133 159 140 C184 147 200 196 200 228Z" fill="#9FC4AB"/>
    <path d="M200 212 C200 212 237 197 258 167 C276 141 266 117 241 124 C216 131 200 180 200 212Z" fill="#75A888"/>
    {/* Leaf pair 4 (y≈148) */}
    <path d="M200 155 C200 155 171 141 153 116 C138 94 148 74 169 81 C190 88 200 126 200 155Z" fill="#A8D5B5"/>
    <path d="M200 140 C200 140 229 126 247 101 C262 79 252 59 231 66 C210 73 200 111 200 140Z" fill="#8BB89A"/>
    {/* Leaf pair 5 — top, smallest (y≈83) */}
    <path d="M200 88 C200 88 179 77 166 59 C155 43 163 29 179 35 C195 41 200 66 200 88Z" fill="#A8D5B5"/>
    <path d="M200 76 C200 76 221 65 234 47 C245 31 237 17 221 23 C205 29 200 54 200 76Z" fill="#9FC4AB"/>
    {/* Terminal bud */}
    <circle cx="200" cy="44" r="5" fill="#A8D5B5" opacity="0.8"/>
    <circle cx="200" cy="44" r="2.5" fill="#8BB89A"/>
    {/* Leaf veins */}
    <path d="M200 378 C178 353 152 338 128 328" stroke="#5E8F6D" strokeWidth="0.9" strokeLinecap="round" opacity="0.4"/>
    <path d="M200 360 C222 335 248 320 272 310" stroke="#4A7C59" strokeWidth="0.9" strokeLinecap="round" opacity="0.4"/>
    {/* Floating seeds/particles */}
    <circle cx="148" cy="78" r="2.5" fill="#A8D5B5" opacity="0.5"/>
    <circle cx="260" cy="96" r="2" fill="#A8D5B5" opacity="0.45"/>
    <circle cx="130" cy="196" r="1.8" fill="#A8D5B5" opacity="0.4"/>
    <circle cx="278" cy="174" r="2.2" fill="#A8D5B5" opacity="0.45"/>
    <circle cx="165" cy="308" r="1.5" fill="#A8D5B5" opacity="0.35"/>
  </svg>
);

const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { loading, error } = useAuth();
  const [localLoading, setLocalLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {}, []);

  const onSubmit = async (data) => {
    setLocalLoading(true);
    dispatch(loginRequest());
    try {
      const response = await authService.login(data.email, data.password);
      if (response.tokens?.accessToken && response.user) {
        localStorage.setItem('token', response.tokens.accessToken);
        localStorage.setItem('refreshToken', response.tokens.refreshToken);
        dispatch(loginSuccess({ token: response.tokens.accessToken, user: response.user }));
        toast.success(t('auth.loginSuccess'));
        navigate('/');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || t('auth.loginError');
      dispatch(loginFailure(errorMessage));
      toast.error(errorMessage);
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', backgroundColor: '#F6F8F4' }}>

      {/* Left panel */}
      <Box sx={{
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '42%',
        minHeight: '100vh',
        backgroundColor: '#1A3329',
        position: 'relative',
        overflow: 'hidden',
        p: 5,
      }}>
        {/* Decorative circles */}
        <Box sx={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320,
          borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.035)' }} />
        <Box sx={{ position: 'absolute', bottom: -60, left: -60, width: 260, height: 260,
          borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.035)' }} />
        <Box sx={{ position: 'absolute', bottom: 140, right: -30, width: 140, height: 140,
          borderRadius: '50%', backgroundColor: 'rgba(139,184,154,0.07)' }} />

        {/* Brand */}
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75 }}>
            <Box sx={{
              width: 34, height: 34,
              backgroundColor: 'rgba(139,184,154,0.2)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid rgba(139,184,154,0.35)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 20.5 C11.7 16.5 12.3 12.5 12 5.5" stroke="#8BB89A" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M8.5 20.5 L15.5 20.5" stroke="#8BB89A" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M12 15.5 C9.5 14.5 7 12 6.5 9 C9.5 8.5 12 11.5 12 15.5Z" fill="#8BB89A"/>
                <path d="M12 11.5 C14.5 10.5 17 8 17.5 5 C14.5 4.5 12 7.5 12 11.5Z" fill="#8BB89A"/>
                <circle cx="12" cy="4" r="1.4" fill="#8BB89A"/>
              </svg>
            </Box>
            <Typography sx={{
              fontFamily: '"Lora", Georgia, serif',
              fontSize: '1.1rem', fontWeight: 600,
              color: '#E8F0E8', letterSpacing: '0.01em',
            }}>
              Vasundhara Seedlings
            </Typography>
          </Box>
          <Typography sx={{
            fontSize: '0.68rem', color: 'rgba(200,225,208,0.55)',
            letterSpacing: '0.13em', textTransform: 'uppercase', pl: '50px',
          }}>
            Management System
          </Typography>
        </Box>

        {/* Botanical illustration */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <SaplingSVG />
        </Box>

        {/* Tagline */}
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography sx={{
            fontFamily: '"Lora", Georgia, serif',
            fontSize: '1.375rem', fontWeight: 400, fontStyle: 'italic',
            color: 'rgba(232,240,232,0.82)', lineHeight: 1.55, mb: 2,
          }}>
            "Growing greener,<br />one seedling at a time."
          </Typography>
          <Box sx={{ width: 36, height: 2, backgroundColor: 'rgba(139,184,154,0.45)', borderRadius: 1 }} />
        </Box>
      </Box>

      {/* Right panel — form */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: { xs: 3, sm: 6, lg: 9 },
        py: 6,
      }}>
        {/* Mobile brand */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.5, mb: 5 }}>
          <Box sx={{
            width: 30, height: 30, backgroundColor: '#EBF2ED',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 20.5 C11.7 16.5 12.3 12.5 12 5.5" stroke="#4A7C59" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M8.5 20.5 L15.5 20.5" stroke="#4A7C59" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M12 15.5 C9.5 14.5 7 12 6.5 9 C9.5 8.5 12 11.5 12 15.5Z" fill="#4A7C59"/>
              <path d="M12 11.5 C14.5 10.5 17 8 17.5 5 C14.5 4.5 12 7.5 12 11.5Z" fill="#4A7C59"/>
              <circle cx="12" cy="4" r="1.4" fill="#4A7C59"/>
            </svg>
          </Box>
          <Typography sx={{ fontFamily: '"Lora", Georgia, serif', fontSize: '1.05rem', fontWeight: 600, color: '#1A2E1A' }}>
            Vasundhara Seedlings
          </Typography>
        </Box>

        <Box sx={{ width: '100%', maxWidth: 400 }}>
          <Box sx={{ mb: 5 }}>
            <Typography sx={{
              fontFamily: '"Lora", Georgia, serif',
              fontSize: { xs: '1.75rem', sm: '2rem' },
              fontWeight: 600, color: '#1A2E1A', lineHeight: 1.2, mb: 1,
            }}>
              Welcome back
            </Typography>
            <Typography sx={{ fontSize: '0.9375rem', color: '#3D5440', lineHeight: 1.5 }}>
              Sign in to manage your nursery operations
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          <form onSubmit={handleSubmit(onSubmit)}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <TextField
                fullWidth
                label="Email address"
                type="email"
                {...register('email')}
                error={!!errors.email}
                helperText={errors.email?.message}
                disabled={loading || localLoading}
                autoComplete="email"
                autoFocus
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
                error={!!errors.password}
                helperText={errors.password?.message}
                disabled={loading || localLoading}
                autoComplete="current-password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                        sx={{ color: '#7A9282', mr: -0.5 }}
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading || localLoading}
                sx={{
                  mt: 0.5,
                  py: 1.6,
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  backgroundColor: '#1A3329',
                  '&:hover': { backgroundColor: '#2E5D44', transform: 'translateY(-1px)' },
                  '&:active': { transform: 'translateY(0)' },
                  boxShadow: '0 4px 16px rgba(26,51,41,0.32)',
                  transition: 'all 0.2s ease',
                }}
              >
                {loading || localLoading
                  ? <CircularProgress size={22} sx={{ color: 'rgba(255,255,255,0.8)' }} />
                  : 'Sign In'
                }
              </Button>
            </Box>
          </form>

          <Typography sx={{ mt: 6, textAlign: 'center', fontSize: '0.78rem', color: '#7A9282' }}>
            Vasundhara Seedlings &copy; {new Date().getFullYear()}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Login;
