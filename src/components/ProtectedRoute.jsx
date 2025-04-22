import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, session } = useAuth();
  const location = useLocation();

  useEffect(() => {
    console.log('ProtectedRoute:', { 
      isAuthenticated, 
      loading, 
      hasDid: session?.did ? true : false,
      path: location.pathname
    });
  }, [isAuthenticated, loading, session, location]);

  // Only show loading state when actively checking auth
  if (loading) {
    console.log('ProtectedRoute: Auth is still loading');
    return <div>Checking authentication status...</div>;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    console.log('ProtectedRoute: Not authenticated, redirecting to login');
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  console.log('ProtectedRoute: Authentication confirmed, rendering protected content');
  return children;
};

export default ProtectedRoute; 