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
  const returnUrl = queryParams.get('returnUrl') || '/';

  useEffect(() => {
    if (isAuthenticated) {
      console.log('Already authenticated, redirecting from Login page to:', returnUrl);
      navigate(returnUrl);
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
    return <div>Redirecting...</div>;
  }

  return (
    <div className="login-container">
      <h1>Login to Cred Blue</h1>
      <p>Enter your Bluesky handle (e.g., yourname.bsky.social) or leave blank to use bsky.social.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={handle}
          onChange={handleInputChange}
          placeholder="yourname.bsky.social (optional)"
          aria-label="Bluesky Handle (optional)"
        />
        {loading && <p>Processing...</p>}
        {error && <p className="error-message">Login failed: {error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : 'Login with Bluesky'}
        </button>
      </form>
      <p className="privacy-note">
        We use official Bluesky authentication. We don't see or store your password.
      </p>
    </div>
  );
};

export default Login;
