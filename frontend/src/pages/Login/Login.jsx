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

const BotanicalSVG = () => (
  <svg viewBox="0 0 400 500" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ width: '100%', maxWidth: 340, opacity: 0.2 }}>
    <path d="M200 480 C200 480 198 380 202 260 C205 160 195 80 200 20" stroke="#A8D5B5" strokeWidth="3" strokeLinecap="round"/>
    <path d="M200 300 C200 300 140 270 100 220 C70 180 80 130 120 140 C160 150 200 210 200 300Z" fill="#7AAB8A"/>
    <path d="M200 280 C200 280 260 250 300 195 C330 150 320 100 280 115 C240 130 200 200 200 280Z" fill="#5E8F6D"/>
    <path d="M200 380 C200 380 155 355 125 315 C102 280 110 245 140 255 C170 265 200 320 200 380Z" fill="#8BB89A"/>
    <path d="M200 360 C200 360 245 335 275 292 C298 258 290 223 260 235 C230 247 200 308 200 360Z" fill="#6FA080"/>
    <path d="M200 180 C200 180 168 162 148 135 C132 112 140 88 162 96 C184 104 200 148 200 180Z" fill="#9FC4AB"/>
    <path d="M200 160 C200 160 232 142 252 114 C268 90 260 66 238 75 C216 84 200 128 200 160Z" fill="#75A888"/>
    <path d="M200 420 C200 420 170 440 150 460 C135 475 138 490 155 488 C172 486 200 465 200 420Z" fill="#8BB89A"/>
    <path d="M200 420 C200 420 230 440 250 460 C265 475 262 490 245 488 C228 486 200 465 200 420Z" fill="#75A888"/>
    <path d="M200 300 C185 270 155 245 120 230" stroke="#5E8F6D" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    <path d="M200 280 C215 250 245 228 280 215" stroke="#4A7C59" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    <circle cx="155" cy="120" r="3" fill="#A8D5B5" opacity="0.6"/>
    <circle cx="248" cy="105" r="2.5" fill="#A8D5B5" opacity="0.6"/>
    <circle cx="118" cy="300" r="2" fill="#A8D5B5" opacity="0.5"/>
    <circle cx="292" cy="278" r="2" fill="#A8D5B5" opacity="0.5"/>
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
                <path d="M12 22C12 22 11 18 8 14C5 10 3 8 3 6C3 4 5 2 8 2C10 2 11.5 3 12 4C12.5 3 14 2 16 2C19 2 21 4 21 6C21 8 19 10 16 14C13 18 12 22 12 22Z" fill="#8BB89A"/>
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
          <BotanicalSVG />
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
              <path d="M12 22C12 22 11 18 8 14C5 10 3 8 3 6C3 4 5 2 8 2C10 2 11.5 3 12 4C12.5 3 14 2 16 2C19 2 21 4 21 6C21 8 19 10 16 14C13 18 12 22 12 22Z" fill="#4A7C59"/>
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
