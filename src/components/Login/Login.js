import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Login.css';

const Login = () => {
  const [handle, setHandle] = useState('');
  const { login, loading, error, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Extract returnUrl from query parameters
  const queryParams = new URLSearchParams(location.search);
  const returnUrl = queryParams.get('returnUrl') || '/verifier';

  console.log('Login component: returnUrl =', returnUrl);

  // Log auth status to debug
  useEffect(() => {
    console.log('Login component auth status:', {
      isAuthenticated,
      loading,
      hasError: !!error,
      returnUrl
    });
  }, [isAuthenticated, loading, error, returnUrl]);

  // Handle redirection after successful authentication
  useEffect(() => {
    if (isAuthenticated) {
      console.log('Login: User is authenticated, redirecting to', returnUrl);
      
      // Set a short delay to ensure state updates complete
      setTimeout(() => {
        console.log('Login: Executing redirect to', returnUrl);
        window.location.replace(returnUrl);
      }, 100);
    }
  }, [isAuthenticated, returnUrl]);

  const handleInputChange = (event) => {
    setHandle(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    console.log(`Login attempt for handle: ${handle || 'default PDS'}, returnUrl: ${returnUrl}`);
    
    try {
      // Store the returnUrl in localStorage as a backup
      localStorage.setItem('auth_redirect_url', returnUrl);
      
      // Call the login function from AuthContext
      await login(handle || null, returnUrl);
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  // If already authenticated, show a message while redirecting
  if (isAuthenticated) {
    return (
      <div className="login-container login-status">
        <p>Already logged in. Redirecting to {returnUrl}...</p>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-content">
        <h1>Login to cred.blue</h1>
        <p>Enter your Bluesky or ATProto handle</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            value={handle}
            onChange={handleInputChange}
            placeholder="username.bsky.social"
            aria-label="Bluesky Handle (optional)"
            className="login-input-field"
            disabled={loading}
          />
          {loading && <p className="login-status-message">Processing...</p>}
          {error && <p className="login-error-message">Login failed: {error}</p>}
          <button
            type="submit"
            disabled={loading || isAuthenticated}
            className="login-submit-button"
          >
            {loading ? 'Processing...' : 'Login with Bluesky'}
          </button>
        </form>
        <p className="login-privacy-note">
          We use official Bluesky/ATProto OAuth to securely process your login.
        </p>
      </div>
    </div>
  );
};

export default Login;
