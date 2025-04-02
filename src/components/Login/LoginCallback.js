import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Loading from '../Loading/Loading';

// This component handles the callback redirect from the Bluesky OAuth process
const LoginCallback = () => {
  const { loading, isAuthenticated, session, checkAuthStatus } = useAuth();
  const [error, setError] = useState(null);
  const [returnUrl, setReturnUrl] = useState('/');
  const [processingComplete, setProcessingComplete] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const location = useLocation();
  const callbackAttempts = useRef(0);
  const maxAttempts = 2;
  
  // First effect: Check if we're already authenticated
  useEffect(() => {
    // If we already have authentication, we can skip the processing
    if (isAuthenticated && session) {
      console.log('Already authenticated in initial check, preparing immediate redirect');
      setProcessingComplete(true);
      setIsRedirecting(true);
    }
  }, []);
  
  // Second effect: Process the callback if needed
  useEffect(() => {
    // Skip processing if:
    // 1. We've already determined we should redirect
    // 2. Processing is already complete
    // 3. We've reached the maximum number of attempts
    if (isRedirecting || processingComplete || callbackAttempts.current >= maxAttempts) {
      return;
    }
    
    callbackAttempts.current += 1;
    console.log(`Processing callback attempt ${callbackAttempts.current}`);
    
    const handleCallback = async () => {
      try {
        // Extract return URL from state or session storage
        const sessionReturnUrl = sessionStorage.getItem('returnUrl');
        const params = new URLSearchParams(location.search);
        const stateParam = params.get('state');
        
        // Attempt to decode state if available
        if (stateParam) {
          try {
            const decodedState = JSON.parse(atob(stateParam));
            if (decodedState && decodedState.returnUrl) {
              setReturnUrl(decodedState.returnUrl);
            }
          } catch (e) {
            console.error('Failed to decode state parameter:', e);
          }
        }
        
        // Use sessionStorage return URL if available (it takes precedence)
        if (sessionReturnUrl) {
          setReturnUrl(sessionReturnUrl);
          sessionStorage.removeItem('returnUrl');
        }
        
        // Check for error in URL parameters
        const errorParam = params.get('error');
        if (errorParam) {
          // Only set error if we don't have a session
          if (!isAuthenticated || !session) {
            setError(errorParam);
            setProcessingComplete(true);
          } else {
            // We have a session despite the error param, so redirect
            setIsRedirecting(true);
            setProcessingComplete(true);
          }
          return;
        }

        // If already authenticated, skip further processing
        if (isAuthenticated && session) {
          console.log('Already authenticated during callback processing, skipping auth check');
          setIsRedirecting(true);
          setProcessingComplete(true);
          return;
        }

        // If we get here, we need to check server authentication
        const authResult = await checkAuthStatus();
        
        if (authResult || isAuthenticated) {
          console.log('Auth check successful, preparing redirect');
          setIsRedirecting(true);
          setProcessingComplete(true);
        } else {
          console.error('Auth check failed, but checking for session one more time');
          
          // Double-check session state before showing error
          if (session) {
            console.log('Found session after auth check failed, still redirecting');
            setIsRedirecting(true);
            setProcessingComplete(true);
          } else {
            setError('Authentication failed. Could not establish a valid session.');
            setProcessingComplete(true);
          }
        }
      } catch (err) {
        console.error('Error handling login callback:', err);
        
        // If we have a session despite the error, still redirect
        if (session && isAuthenticated) {
          console.log('Error occurred but session exists, proceeding with redirect');
          setIsRedirecting(true);
          setProcessingComplete(true);
        } else {
          setError('Failed to complete login process');
          setProcessingComplete(true);
        }
      }
    };

    handleCallback();
  }, [location, checkAuthStatus, isAuthenticated, session, processingComplete, isRedirecting]);

  // Always prioritize redirecting if we're authenticated
  if (isAuthenticated && session) {
    console.log(`Redirecting to ${returnUrl} with valid session`);
    return <Navigate to={returnUrl} replace />;
  }
  
  // Show loading while still processing
  if (loading || (!processingComplete && !isRedirecting)) {
    return <Loading message="Processing login..." />;
  }

  // Show error only if we've completed processing, have an error, and don't have a valid session
  if (processingComplete && error && (!isAuthenticated || !session)) {
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

  // Fallback redirect when processing is complete
  return <Navigate to={returnUrl} replace />;
};

export default LoginCallback; 