import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Use a side effect to check authentication and redirect if needed
  useEffect(() => {
    // If we're still loading, wait
    if (loading) {
      console.log('ProtectedRoute: Waiting for auth to complete...');
      return;
    }

    // If not authenticated, redirect immediately
    if (!isAuthenticated) {
      console.log('ProtectedRoute: Not authenticated, forcing redirect to login...');
      const redirectUrl = `/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`;
      
      // Force redirect - this is the simplest, most reliable approach
      window.location.replace(redirectUrl);
    } else {
      console.log('ProtectedRoute: User is authenticated, allowing access');
    }
  }, [isAuthenticated, loading, location.pathname, location.search]);

  // Keep the component simple - only render children if authenticated
  if (loading) {
    return <div className="auth-loading">Checking authentication...</div>;
  }
  
  if (!isAuthenticated) {
    return <div className="auth-redirecting">Not authenticated - redirecting to login...</div>;
  }

  return children;
};

export default ProtectedRoute; 