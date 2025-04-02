import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Loading from '../Loading/Loading';

// This component handles the callback redirect from the Bluesky OAuth process
const LoginCallback = () => {
  const { loading, isAuthenticated, checkAuthStatus } = useAuth();
  const [error, setError] = useState(null);
  const [returnUrl, setReturnUrl] = useState('/');
  const [processingComplete, setProcessingComplete] = useState(false);
  const location = useLocation();
  const callbackAttempts = useRef(0);
  const maxAttempts = 2;

  useEffect(() => {
    // Skip if already processed or max attempts reached
    if (processingComplete || callbackAttempts.current >= maxAttempts) {
      return;
    }
    
    callbackAttempts.current += 1;
    
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
          setProcessingComplete(true);
          return;
        }

        // Check server-side authentication status
        const authResult = await checkAuthStatus();
        setProcessingComplete(true);
        
        if (!authResult) {
          setError('Authentication failed. Could not establish a valid session.');
        }
      } catch (err) {
        console.error('Error handling login callback:', err);
        setError('Failed to complete login process');
        setProcessingComplete(true);
      }
    };

    handleCallback();
  }, [location, checkAuthStatus, processingComplete]);

  // Don't redirect immediately while loading - wait for the check to complete
  if (loading && !processingComplete) {
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

  // Only redirect when processing is complete and we're authenticated
  if (processingComplete && isAuthenticated) {
    return <Navigate to={returnUrl} replace />;
  }
  
  // If processing is complete but not authenticated, show error
  if (processingComplete && !isAuthenticated) {
    return (
      <div className="login-callback">
        <div className="error">
          <h3>Login Failed</h3>
          <p>Could not establish a valid session. Please try again.</p>
          <a href="/login">Return to login</a>
        </div>
      </div>
    );
  }
  
  // Fallback loading state
  return <Loading message="Completing authentication..." />;
};

export default LoginCallback; 