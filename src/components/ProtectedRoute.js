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
  const [checkingStatus, setCheckingStatus] = useState(false);
  const checkCount = useRef(0);
  const maxChecks = 3; // Maximum number of checks to prevent infinite loops
  
  // Perform an immediate auth check when the component mounts
  useEffect(() => {
    const checkAuth = async () => {
      if (checkCount.current >= maxChecks) {
        console.error("Maximum auth check attempts reached. Stopping to prevent infinite loop.");
        return;
      }
      
      // Only proceed if not already checking, not already redirecting, and not loading
      if (!isAuthenticated && !checkingStatus && !redirecting && !loading) {
        try {
          console.log("ProtectedRoute: Checking authentication status");
          setCheckingStatus(true);
          checkCount.current += 1;
          await checkAuthStatus();
        } catch (error) {
          console.error("ProtectedRoute: Auth check failed:", error);
        } finally {
          setCheckingStatus(false);
        }
      }
    };
    
    // Call immediately on mount or when dependency values change
    checkAuth();
    
    // Set up interval for periodic checks only if authenticated
    let interval;
    if (isAuthenticated && session) {
      console.log("ProtectedRoute: Setting up periodic auth checks");
      interval = setInterval(() => {
        checkAuthStatus().catch(err => {
          console.error("Error in periodic auth check:", err);
        });
      }, 30000); // Check every 30 seconds
    }
    
    return () => {
      if (interval) {
        console.log("ProtectedRoute: Clearing periodic auth checks");
        clearInterval(interval);
      }
    };
  }, [isAuthenticated, checkAuthStatus, redirecting, loading, checkingStatus, session]);

  // Show loading state while authentication is being checked
  if (loading || checkingStatus) {
    return <Loading message="Checking authentication..." />;
  }

  // If not authenticated, redirect to login with return URL
  if (!isAuthenticated && !redirecting) {
    console.log("ProtectedRoute: Not authenticated, redirecting to login");
    setRedirecting(true); // Prevent multiple redirects
    const returnUrl = encodeURIComponent(location.pathname);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  // Check if user is allowed
  if (session && session.handle && !isAccountAllowed(session)) {
    console.log("ProtectedRoute: User not in allowlist, redirecting to supporter page");
    return <Navigate to="/supporter" replace />;
  }

  // Reset counter when rendering the protected content
  checkCount.current = 0;
  
  // Render children if authenticated and allowed
  console.log("ProtectedRoute: Authentication successful, rendering protected content");
  return children;
};

export default ProtectedRoute; 