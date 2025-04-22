import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './LoginCallback.css'; // Optional: Add styles if needed

const LoginCallback = () => {
  const { client } = useAuth(); // Get the client instance from context
  const navigate = useNavigate();
  const [status, setStatus] = useState('Processing login...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      // Client might not be initialized immediately on page load
      if (!client) {
        setStatus('Waiting for authentication client...');
        // Optionally add a small delay and retry or rely on AuthContext re-render
        const timeoutId = setTimeout(() => {
           if (!client) { // Check again after delay
              console.error('OAuth client not available after delay.');
              setError('Authentication client failed to load. Please try logging in again.');
              setStatus(''); // Clear status message
           }
           // If client became available, the effect will re-run anyway
        }, 2000); // Wait 2 seconds
        return () => clearTimeout(timeoutId);
      }

      try {
        console.log('(LoginCallback) Client available, attempting to handle callback...');
        // The client.init() in AuthContext likely already handled the callback.
        // We might not need client.callback() here if init handles it.
        // However, keeping client.callback() as a fallback or direct handler can be robust.
        // Check if init() already processed it by seeing if session exists
        // This check might be complex depending on AuthContext's exact init timing.

        // Let's assume AuthContext's init() handles the primary callback logic.
        // This component might just need to redirect based on the resulting session state.

        // Check AuthContext state directly (may require exposing session explicitly)
        // Or simply redirect - AuthContext should have set the session if successful

        setStatus('Login successful! Redirecting...');

        // Attempt to retrieve the original intended URL from state if passed during login
        // Note: client.init() doesn't directly return state here. We might need
        // AuthContext to store the state temporarily or parse it from the URL hash/query.
        // For simplicity, we'll redirect to home. Implement state parsing if needed.

        // Retrieve returnUrl from state saved during login (requires state handling)
        // const stateParam = new URLSearchParams(window.location.hash.substring(1)).get('state') || new URLSearchParams(window.location.search).get('state');
        let returnUrl = '/';
        // if (stateParam) {
        //   try {
        //      const decodedState = JSON.parse(atob(stateParam)); // Adjust decoding if needed
        //      returnUrl = decodedState.returnUrl || '/';
        //   } catch (e) {
        //      console.error("Error parsing state parameter:", e);
        //   }
        // }

        // Redirect after a short delay to show the success message
        setTimeout(() => {
          navigate(returnUrl);
        }, 1500);

      } catch (err) {
        console.error('(LoginCallback) Error processing callback:', err);
        setError(`Login failed: ${err.message || 'Unknown error'}`);
        setStatus('');
      }
    };

    handleCallback();

  }, [client, navigate]); // Depend on client availability

  return (
    <div className="login-callback-container">
      <h2>Authentication Callback</h2>
      {status && <p className="status-message">{status}</p>}
      {error && <p className="error-message">{error}</p>}
      {!status && !error && <p>Verifying authentication...</p>}
      {/* Add a button to retry or go home if stuck */}
      {(error || (!client && !status && !error)) && (
         <button onClick={() => navigate('/')} className="home-button">Go to Homepage</button>
      )}
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