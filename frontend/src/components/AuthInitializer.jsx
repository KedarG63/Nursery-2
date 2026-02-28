import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setUser, logout } from '../store/authSlice';
import authService from '../services/authService';

/**
 * AuthInitializer - Fetches user profile on app initialization
 * If a token exists in localStorage, fetch the user profile
 */
const AuthInitializer = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');

      if (token) {
        try {
          const response = await authService.getProfile();
          if (response.user) {
            dispatch(setUser(response.user));
          }
        } catch (error) {
          console.error('Failed to fetch user profile:', error);
          // Token is invalid, clear auth state
          dispatch(logout());
        }
      }
    };

    initializeAuth();
  }, [dispatch]);

  return null; // This component doesn't render anything
};

export default AuthInitializer;
