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

  console.log('Login component loaded, returnUrl =', returnUrl);

  useEffect(() => {
    // If already authenticated, redirect to returnUrl
    if (isAuthenticated) {
      console.log('Already authenticated, redirecting from Login page to:', returnUrl);
      navigate(returnUrl, { replace: true });
    }
  }, [isAuthenticated, navigate, returnUrl]);

  const handleInputChange = (event) => {
    setHandle(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    console.log(`Login attempt for handle: ${handle || 'default PDS'}, returnUrl: ${returnUrl}`);
    
    // Call the login function from AuthContext
    // The returnUrl is passed so the user can be redirected after successful login
    try {
      await login(handle || null, returnUrl);
    } catch (err) {
      console.error('Login error:', err);
      // Error handling is done through the AuthContext error state
    }
  };

  if (isAuthenticated) {
    return (
      <div className="login-container login-status">
        <p>Already logged in. Redirecting...</p>
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
