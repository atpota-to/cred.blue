import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Loading from '../Loading/Loading';

// This component handles the callback redirect from the Bluesky OAuth process
const LoginCallback = () => {
  const { loading } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    // The actual callback handling is done in the AuthContext.js
    // through the client.init() method that automatically processes 
    // the URL params when the page loads
    
    // We just check if there are any errors in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    
    if (errorParam) {
      setError(errorDescription || errorParam);
    }
  }, []);

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

  // Redirect to the home page if no errors
  return <Navigate to="/" replace />;
};

export default LoginCallback; 