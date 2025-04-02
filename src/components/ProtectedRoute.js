import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isAccountAllowed } from '../config/allowlist';
import Loading from './Loading/Loading';

// Component to protect routes that require authentication
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, session, checkAuthStatus } = useAuth();
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);
  const checkCount = useRef(0);
  const maxChecks = 3; // Maximum number of checks to prevent infinite loops
  
  useEffect(() => {
    // Prevent excessive auth checks
    if (checkCount.current >= maxChecks) {
      console.error("Maximum auth check attempts reached. Stopping to prevent infinite loop.");
      return;
    }
    
    // Only check if not already authenticated and not already redirecting
    if (!isAuthenticated && !redirecting && !loading) {
      checkCount.current += 1;
      checkAuthStatus();
    }
    
    // Set up interval for periodic checks - but only if authenticated
    // This prevents constantly checking while unauthenticated
    let interval;
    if (isAuthenticated) {
      interval = setInterval(checkAuthStatus, 30000); // Check every 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, checkAuthStatus, redirecting, loading]);

  // Show loading state while authentication is being checked
  if (loading) {
    return <Loading message="Checking authentication..." />;
  }

  // If not authenticated, redirect to login with return URL
  if (!isAuthenticated && !redirecting) {
    setRedirecting(true); // Prevent multiple redirects
    const returnUrl = encodeURIComponent(location.pathname);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  // Check if user is allowed
  // Only check if we have detailed user info
  // If we're using server-side sessions, we might not need this check
  if (session && session.handle && !isAccountAllowed(session)) {
    return <Navigate to="/supporter" replace />;
  }

  // Reset counter when rendering the protected content
  checkCount.current = 0;
  
  // Render children if authenticated and allowed
  return children;
};

export default ProtectedRoute; 