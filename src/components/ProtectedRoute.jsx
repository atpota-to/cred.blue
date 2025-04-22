import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [shouldRender, setShouldRender] = useState(false);
  const [redirectTriggered, setRedirectTriggered] = useState(false);

  // Log initial state on mount
  useEffect(() => {
    console.log('ProtectedRoute mounted with auth state:', { 
      isAuthenticated, 
      loading,
      hasDid: session?.did ? true : false,
      path: location.pathname
    });
  }, []);
  
  // Determine if we should redirect or render children
  useEffect(() => {
    // Only make decision after loading completes
    if (!loading) {
      if (isAuthenticated) {
        console.log('ProtectedRoute: Authentication confirmed, will render protected content');
        setShouldRender(true);
      } else {
        // Only trigger redirect once to avoid infinite loops
        if (!redirectTriggered) {
          console.log('ProtectedRoute: Not authenticated, redirecting to login');
          setRedirectTriggered(true);
          
          // Prepare the redirect URL
          const redirectUrl = `/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`;
          
          // Try React Router navigation first
          navigate(redirectUrl, { replace: true });
          
          // Fallback to direct redirection after a short delay
          // This ensures redirection happens even if React Router navigation fails
          setTimeout(() => {
            if (window.location.pathname !== '/login') {
              console.log('ProtectedRoute: Fallback to direct window location redirect');
              window.location.href = redirectUrl;
            }
          }, 100);
        }
      }
    }
  }, [isAuthenticated, loading, navigate, location, redirectTriggered]);

  // Show loading state while checking auth
  if (loading) {
    return <div className="auth-loading">Checking authentication status...</div>;
  }

  // Render children only when explicitly set to do so
  return shouldRender ? children : <div className="auth-redirecting">Redirecting to login...</div>;
};

export default ProtectedRoute; 