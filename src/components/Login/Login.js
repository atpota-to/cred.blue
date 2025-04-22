import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Login.css';

const Login = () => {
  const [handle, setHandle] = useState('');
  const { login, loading, error, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const returnUrl = queryParams.get('returnUrl') || '/verifier';

  useEffect(() => {
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
    await login(handle || null, returnUrl);
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
        <p>Enter your Bluesky or ATProto handle (e.g., yourname.bsky.social)</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            value={handle}
            onChange={handleInputChange}
            placeholder="yourname.bsky.social (optional)"
            aria-label="Bluesky Handle (optional)"
            className="login-input-field"
            disabled={loading}
          />
          {loading && <p className="login-status-message">Processing...</p>}
          {error && <p className="login-error-message">Login failed: {error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="login-submit-button"
          >
            {loading ? 'Processing...' : 'Login'}
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
