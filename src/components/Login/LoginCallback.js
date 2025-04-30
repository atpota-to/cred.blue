import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './LoginCallback.css'; // Optional: Add styles if needed

const LoginCallback = () => {
  // Get loading and authentication status from AuthContext
  const { loading, isAuthenticated, error: authError, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    // Log location information for debugging
    console.log('(LoginCallback) Current location:', {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      state: location.state
    });

    // Don't do anything until the AuthProvider is done loading
    if (loading) {
      return;
    }

    // Once loading is complete, check the authentication status
    if (isAuthenticated) {
      console.log('(LoginCallback) Authentication successful, redirecting...');
      
      // First, try to get returnUrl from localStorage (set during login)
      let returnUrl = localStorage.getItem('auth_redirect_url');
      console.log('(LoginCallback) Found returnUrl in localStorage:', returnUrl);
      
      // Parse returnUrl from query parameters (if present)
      const searchParams = new URLSearchParams(location.search);
      if (searchParams.has('returnUrl')) {
        returnUrl = searchParams.get('returnUrl');
        console.log(`(LoginCallback) Overriding with returnUrl from URL:`, returnUrl);
      }
      
      // Check if we have state data from the OAuth callback
      if (session?.state) {
        try {
          // The state is stored as a JSON string
          const stateData = JSON.parse(session.state);
          if (stateData && stateData.returnUrl) {
            console.log(`(LoginCallback) Found returnUrl in OAuth state:`, stateData.returnUrl);
            returnUrl = stateData.returnUrl;
          }
        } catch (err) {
          console.error('(LoginCallback) Error parsing state data:', err);
        }
      }
      
      // Fallback to /verifier if no returnUrl found
      if (!returnUrl) {
        returnUrl = '/verifier';
        console.log(`(LoginCallback) No returnUrl found, defaulting to:`, returnUrl);
      }
      
      // Clean up localStorage
      localStorage.removeItem('auth_redirect_url');
      
      console.log(`(LoginCallback) Final redirect destination:`, returnUrl);
      navigate(returnUrl, { replace: true });
    } else {
      // If not authenticated after loading, something went wrong
      console.error('(LoginCallback) Authentication failed after loading.');
      setLocalError(authError || 'Authentication failed. Please try logging in again.');
    }

  }, [loading, isAuthenticated, navigate, authError, location, session]); // Added session dependency

  // Display loading message
  if (loading) {
    return (
      <div className="login-callback-container">
        <h2>Processing Login</h2>
        <p className="status-message">Verifying authentication...</p>
        {/* Optionally add a spinner here */}
      </div>
    );
  }

  // Display error message if authentication failed
  if (localError) {
    return (
      <div className="login-callback-container">
        <h2>Authentication Failed</h2>
        <p className="error-message">{localError}</p>
        <button onClick={() => navigate('/login')} className="home-button">Try Login Again</button>
        <button onClick={() => navigate('/')} className="home-button" style={{marginLeft: '10px'}}>Go to Homepage</button>
      </div>
    );
  }

  // Render nothing while redirecting (or a minimal redirecting message)
  // This state should be brief as the effect triggers redirection quickly
  return (
      <div className="login-callback-container">
        <h2>Redirecting...</h2>
      </div>
  );
};

export default LoginCallback;

// --- Basic CSS (LoginCallback.css) ---
/*
.login-callback-container {
  padding: 40px;
  text-align: center;
  max-width: 600px;
  margin: 40px auto;
  background-color: var(--navbar-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  color: var(--text);
}

.status-message {
  color: var(--text-muted); // Adjust variable if needed
  font-weight: bold;
}

.error-message {
  color: var(--error); // Use theme error color
  font-weight: bold;
}

.home-button {
   margin-top: 20px;
   background-color: var(--button-bg);
   color: var(--button-text);
   border: none;
   padding: 10px 20px;
   border-radius: 5px;
   cursor: pointer;
}

.home-button:hover {
   background-color: var(--button-hover-bg); // Adjust variable if needed
}
*/ 