import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

// Create auth context
export const AuthContext = createContext(null);

// Set the appropriate domain based on the current hostname
let domain = 'https://testing.cred.blue';

// Always use the current domain for client_id to ensure it matches the host
const metadataUrl = `https://testing.cred.blue/client-metadata.json`;

// Client metadata for Bluesky OAuth
const clientMetadata = {
  client_id: metadataUrl,
  client_name: "Cred.blue",
  client_uri: domain,
  redirect_uris: [`https://testing.cred.blue/login/callback`],
  logo_uri: `https://testing.cred.blue/favicon.ico`,
  scope: "atproto",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  application_type: "web",
  dpop_bound_access_tokens: true
};

export const AuthProvider = ({ children }) => {
  const [client, setClient] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const initializing = useRef(false);

  // Updated initializeAuth for BrowserOAuthClient
  useEffect(() => {
    const initializeAuth = async () => {
      if (initializing.current || client) return; // Prevent multiple initializations
      initializing.current = true;
      setLoading(true);
      setError(null);
      console.log('(AuthProvider) Initializing BrowserOAuthClient...');

      try {
        // Create the client instance
        const oauthClient = new BrowserOAuthClient({
          clientMetadata: clientMetadata,
          handleResolver: 'https://bsky.social', // Use Bluesky's resolver or your own
          scope: 'atproto transition:generic'
        });

        setClient(oauthClient); // Store the client instance

        // Initialize the client - this handles callbacks and session restoration
        const initResult = await oauthClient.init();

        if (initResult?.session) {
          setSession(initResult.session);
          console.log(`(AuthProvider) Session ${initResult.state ? 'established via callback' : 'restored'}:`, initResult.session.did);
          if (initResult.state) {
            console.log('(AuthProvider) Original state from callback:', initResult.state);
            // Optionally, redirect based on state if needed, e.g., using navigate
            // const returnUrl = initResult.state.returnUrl || '/'; // Example state usage
            // window.location.href = returnUrl; // Or use React Router navigate
          }
        } else {
          setSession(null);
          console.log('(AuthProvider) No active session found or callback processed.');
        }
      } catch (err) {
        console.error('(AuthProvider) Error initializing client or handling callback:', err);
        setError('Initialization failed. Please try refreshing.');
        setSession(null);
      } finally {
        setLoading(false);
        initializing.current = false;
        console.log('(AuthProvider) Initialization complete.');
      }
    };

    initializeAuth();
  }, [client]); // Dependency on client ensures it runs only once after client is potentially set

  // Updated login function - uses client.signIn()
  const login = useCallback(async (handle, returnUrl = '/') => {
    if (!client) {
      setError("Client not initialized.");
      return;
    }
    console.log(`(AuthProvider) Initiating client-side login for handle: ${handle || 'none specified'}`);
    try {
      // The state can be used to pass information through the redirect, like the return URL
      const stateData = JSON.stringify({ returnUrl });
      // signIn redirects the browser, so code execution stops here if successful
      await client.signIn(handle || 'https://bsky.social', { // Use handle or default PDS
         state: stateData,
         // prompt: 'none', // Uncomment for silent sign-in attempt
      });
    } catch (err) {
      // This catch might run if the user navigates back or cancels
      console.error('(AuthProvider) Error during signIn initiation or cancellation:', err);
      setError('Login initiation failed or was cancelled.');
    }
  }, [client]);

  // Updated Logout function - uses session.signOut()
  const logout = useCallback(async () => {
     if (!session) return;
     console.log('(AuthProvider) Logging out...');
     try {
        await session.signOut(); // Use session's signOut method
        setSession(null);
        // Optionally clear other app state here
        console.log('(AuthProvider) Logout complete.');
        // Redirect to home or login page
        window.location.href = '/'; // Force reload to ensure clean state
     } catch (err) {
       console.error('(AuthProvider) Error during logout:', err);
       // Still attempt to clear local session on error
       setSession(null);
       window.location.href = '/'; // Force reload
     }
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        client, // Export the client instance if needed by components (e.g., LoginCallback)
        session,
        loading, // Renamed from authLoading for clarity
        error,
        isAuthenticated: !!session,
        login,
        logout,
        // Remove checkAuthStatus export
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  // Ensure components using the hook get the updated context value
  // (React handles this, but good to be mindful)
  return context;
}; 