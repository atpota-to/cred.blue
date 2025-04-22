import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Detailed status logging
  useEffect(() => {
    console.log('ProtectedRoute status:', { 
      isAuthenticated, 
      loading, 
      hasDid: session?.did ? true : false,
      path: location.pathname
    });
  }, [isAuthenticated, loading, session, location]);

  // Force navigation when not authenticated and not loading
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      console.log('ProtectedRoute: Not authenticated, redirecting via useEffect hook');
      const redirectUrl = `/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`;
      navigate(redirectUrl, { replace: true });
    }
  }, [isAuthenticated, loading, navigate, location]);

  // Only show loading state when actively checking auth
  if (loading) {
    console.log('ProtectedRoute: Auth is still loading');
    return <div>Checking authentication status...</div>;
  }

  // If not authenticated, redirect with Navigate component as backup
  if (!isAuthenticated) {
    console.log('ProtectedRoute: Not authenticated, redirecting with Navigate component');
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  console.log('ProtectedRoute: Authentication confirmed, rendering protected content');
  return children;
};

export default ProtectedRoute; 