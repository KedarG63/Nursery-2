import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { loginRequest, loginSuccess, loginFailure } from '../../store/authSlice';
import authService from '../../services/authService';
import useAuth from '../../hooks/useAuth';

// Validation schema
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { loading, error } = useAuth();
  const [localLoading, setLocalLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    // Clear any previous errors on component mount
    return () => {
      // Cleanup if needed
    };
  }, []);

  const onSubmit = async (data) => {
    setLocalLoading(true);
    dispatch(loginRequest());

    try {
      const response = await authService.login(data.email, data.password);

      if (response.tokens?.accessToken && response.user) {
        // Store tokens in localStorage
        localStorage.setItem('token', response.tokens.accessToken);
        localStorage.setItem('refreshToken', response.tokens.refreshToken);

        dispatch(
          loginSuccess({
            token: response.tokens.accessToken,
            user: response.user,
          })
        );
        toast.success(t('auth.loginSuccess'));
        navigate('/');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.message || err.message || t('auth.loginError');
      dispatch(loginFailure(errorMessage));
      toast.error(errorMessage);
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 450,
          width: '100%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" gutterBottom fontWeight="bold" color="primary">
              {t('common.appName')}
            </Typography>
            <Typography variant="h5" gutterBottom>
              {t('auth.loginTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('auth.loginSubtitle')}
            </Typography>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)}>
            <TextField
              fullWidth
              label={t('common.email')}
              type="email"
              margin="normal"
              {...register('email')}
              error={!!errors.email}
              helperText={errors.email?.message}
              disabled={loading || localLoading}
              autoComplete="email"
              autoFocus
            />

            <TextField
              fullWidth
              label={t('common.password')}
              type="password"
              margin="normal"
              {...register('password')}
              error={!!errors.password}
              helperText={errors.password?.message}
              disabled={loading || localLoading}
              autoComplete="current-password"
            />

            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || localLoading}
              sx={{ mt: 3, mb: 2, py: 1.5 }}
            >
              {loading || localLoading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                t('common.login')
              )}
            </Button>
          </form>

          {/* Footer */}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {t('common.appName')} &copy; {new Date().getFullYear()}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
