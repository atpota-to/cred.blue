import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Simple and direct redirect approach
  useEffect(() => {
    // Only check after loading is complete
    if (loading) {
      console.log('ProtectedRoute: Still loading auth status...');
      return;
    }

    // If not authenticated, redirect directly via window.location
    if (!isAuthenticated) {
      console.log('ProtectedRoute: Not authenticated, redirecting to login...');
      const redirectUrl = `/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`;
      window.location.href = redirectUrl;
    } else {
      console.log('ProtectedRoute: User is authenticated, rendering content');
    }
  }, [isAuthenticated, loading, location]);

  // Show loading state while checking auth
  if (loading) {
    return <div className="auth-loading">Checking authentication status...</div>;
  }

  // Show redirecting state if not authenticated
  if (!isAuthenticated) {
    return <div className="auth-redirecting">Redirecting to login...</div>;
  }

  // User is authenticated, render children
  return children;
};

export default ProtectedRoute; 