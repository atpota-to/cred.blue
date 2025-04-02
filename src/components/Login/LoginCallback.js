import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Loading from '../Loading/Loading';

// This component handles the callback redirect from the Bluesky OAuth process
const LoginCallback = () => {
  const { loading, checkAuthStatus } = useAuth();
  const [error, setError] = useState(null);
  const [returnUrl, setReturnUrl] = useState('/');
  const location = useLocation();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get return URL from session storage or state parameter
        const sessionReturnUrl = sessionStorage.getItem('returnUrl');
        const params = new URLSearchParams(location.search);
        const stateParam = params.get('state');
        
        // If state contains encoded returnUrl, extract it
        let decodedState = null;
        if (stateParam) {
          try {
            decodedState = JSON.parse(atob(stateParam));
            if (decodedState && decodedState.returnUrl) {
              setReturnUrl(decodedState.returnUrl);
            }
          } catch (e) {
            console.error('Failed to decode state parameter:', e);
          }
        }
        
        // Prioritize returnUrl from session storage if available
        if (sessionReturnUrl) {
          setReturnUrl(sessionReturnUrl);
          sessionStorage.removeItem('returnUrl');
        }
        
        // Check for error in URL parameters
        const errorParam = params.get('error');
        if (errorParam) {
          setError(errorParam);
          return;
        }

        // Check server-side authentication status
        await checkAuthStatus();
      } catch (err) {
        console.error('Error handling login callback:', err);
        setError('Failed to complete login process');
      }
    };

    handleCallback();
  }, [location, checkAuthStatus]);

  if (loading) {
    return <Loading message="Processing login..." />;
  }

  if (error) {
    return (
      <div className="login-callback">
        <div className="error">
          <h3>Authentication Error</h3>
          <p>{error}</p>
          <a href="/login">Return to login</a>
        </div>
      </div>
    );
  }

  // Redirect to the return URL (or home by default)
  return <Navigate to={returnUrl} replace />;
};

export default LoginCallback; 