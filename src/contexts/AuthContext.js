import React, { createContext, useContext, useState, useEffect } from 'react';
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

  // Initialize the OAuth client
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Create the OAuth client with inline metadata
        const oauthClient = new BrowserOAuthClient({
          clientMetadata, // Pass the inline metadata directly
          handleResolver: 'https://bsky.social', // Using bsky.social as handle resolver
        });

        // Initialize the client and check for existing sessions
        const result = await oauthClient.init();
        console.log('OAuth client initialized:', oauthClient); // Debug log
        setClient(oauthClient);
        
        if (result?.session) {
          setSession(result.session);
        }
        
        // Listen for session deletion events
        oauthClient.addEventListener('deleted', (event) => {
          if (event.data.did === session?.sub) {
            setSession(null);
          }
        });
        
        setLoading(false);
      } catch (err) {
        console.error('Auth initialization error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Initiate the login process
  const login = async (handle) => {
    if (!client) return;
    
    try {
      // The signIn method will redirect the user to the OAuth server
      await client.signIn(handle);
      // This code won't execute as the page will be redirected
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message);
    }
  };

  // Logout the user
  const logout = async () => {
    if (!client || !session) {
      console.log('No client or session available for logout'); // Debug log
      return;
    }
    
    try {
      console.log('Attempting logout with client:', client); // Debug log
      // Instead of using client methods, we'll just clear the session
      setSession(null);
      // Clear any stored tokens or session data
      localStorage.removeItem('atproto_session');
    } catch (err) {
      console.error('Logout failed:', err);
      setError(err.message);
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        session, 
        loading, 
        error,
        isAuthenticated: !!session,
        login, 
        logout 
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
  return context;
}; 