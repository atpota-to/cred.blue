import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './LoginCallback.css'; // Optional: Add styles if needed

const LoginCallback = () => {
  // Get loading and authentication status from AuthContext
  const { loading, isAuthenticated, error: authError } = useAuth();
  const navigate = useNavigate();
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    // Don't do anything until the AuthProvider is done loading
    if (loading) {
      return;
    }

    // Once loading is complete, check the authentication status
    if (isAuthenticated) {
      console.log('(LoginCallback) Authentication successful, redirecting...');
      // TODO: Implement state parsing for returnUrl if needed
      const returnUrl = '/'; // Default redirect
      navigate(returnUrl);
    } else {
      // If not authenticated after loading, something went wrong
      console.error('(LoginCallback) Authentication failed after loading.');
      setLocalError(authError || 'Authentication failed. Please try logging in again.');
    }

  }, [loading, isAuthenticated, navigate, authError]); // Depend on loading and auth state

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