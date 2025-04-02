import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Login.css';

const Login = () => {
  const [handle, setHandle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [returnUrl, setReturnUrl] = useState('');
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Extract returnUrl from query params
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const returnPath = searchParams.get('returnUrl');
    if (returnPath) {
      setReturnUrl(returnPath);
    }
  }, [location]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Navigate to return URL if it exists, otherwise to home
      navigate(returnUrl || '/');
    }
  }, [isAuthenticated, navigate, returnUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!handle) {
      setError('Please enter your Bluesky handle');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      // Pass returnUrl to login function
      await login(handle, returnUrl);
      // Note: This code won't run because login redirects to Bluesky OAuth page
    } catch (err) {
      setError('Authentication failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Login with Bluesky</h2>
        <p>Sign in with your Bluesky handle to access protected features.</p>
        
        {returnUrl && (
          <div className="return-notice">
            <p>You'll be redirected back to the page you were trying to access after logging in.</p>
          </div>
        )}
        
        {error && <div className="login-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="handle">Bluesky Handle</label>
            <input
              id="handle"
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourhandle.bsky.social"
              disabled={isLoading}
              autoFocus
            />
          </div>
          
          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Connecting...' : 'Login with Bluesky'}
          </button>
        </form>
        
        <div className="login-info">
          <p>
            We use Bluesky's authentication service to verify your identity.
            No passwords are stored by cred.blue.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
