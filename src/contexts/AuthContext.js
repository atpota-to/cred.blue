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
  const lastAuthCheck = useRef(0);
  const authCheckInProgress = useRef(false);

  // Initialize the OAuth client
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // First check server-side authentication status
        const serverAuthResponse = await fetch('/api/auth/status', {
          credentials: 'include'
        });
        
        const serverAuthData = await serverAuthResponse.json();
        
        if (serverAuthData.isAuthenticated) {
          setSession(serverAuthData.user);
          setLoading(false);
          return;
        }

        // If not authenticated on the server, check client OAuth
        const oauthClient = new BrowserOAuthClient({
          clientMetadata,
          handleResolver: 'https://bsky.social',
        });

        try {
          // Initialize the client and check for existing sessions
          const result = await oauthClient.init();
          console.log('OAuth client initialized:', oauthClient);
          setClient(oauthClient);
          
          if (result?.session) {
            console.log('Found existing OAuth session:', result.session);
            
            // If client has session but server doesn't, we need to sync them
            try {
              const syncResponse = await fetch('/api/sync-session', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                  did: result.session.sub,
                  handle: result.session.handle
                }),
                credentials: 'include'
              });
              
              if (syncResponse.ok) {
                const syncData = await syncResponse.json();
                console.log('Session sync successful:', syncData);
                // Use the server session data which may have more info
                setSession(syncData.user);
              } else {
                console.warn('Session sync failed, using client session');
                // Still use the client session if sync fails
                setSession(result.session);
              }
            } catch (syncError) {
              console.error('Error syncing session:', syncError);
              // If sync fails, still use the client session
              setSession(result.session);
            }
          }
          
          // Listen for session deletion events
          oauthClient.addEventListener('deleted', (event) => {
            if (event.data.did === session?.sub || event.data.did === session?.did) {
              setSession(null);
              // Also logout from server
              fetch('/api/logout', {
                method: 'POST',
                credentials: 'include'
              });
            }
          });
        } catch (oauthError) {
          console.error('OAuth client initialization error:', oauthError);
        }
        
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
  const login = async (handle, returnUrl) => {
    if (!client) return;
    
    try {
      // Save returnUrl to session storage if provided
      if (returnUrl) {
        sessionStorage.setItem('returnUrl', returnUrl);
      }
      
      // Create state parameter with returnUrl
      const state = returnUrl ? 
        btoa(JSON.stringify({ returnUrl })) : 
        undefined;
      
      // Pass state parameter to signIn method
      await client.signIn(handle, { state });
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message);
    }
  };

  // Logout the user
  const logout = async () => {
    try {
      console.log('Starting logout process');
      
      // First, try to logout from the server
      try {
        const response = await fetch('/api/logout', {
          method: 'POST',
          credentials: 'include'
        });
        
        if (response.ok) {
          console.log('Server logout successful');
        } else {
          console.warn('Server logout failed, continuing with client logout');
        }
      } catch (serverLogoutErr) {
        console.error('Error during server logout:', serverLogoutErr);
        // Continue with client-side logout even if server logout fails
      }
      
      // Clear the session state immediately
      setSession(null);
      
      // If we have a client, try to clear its session too
      if (client) {
        try {
          console.log('Attempting to clear OAuth client session');
          
          // Clear OAuth-specific storage items
          localStorage.removeItem('atproto_session');
          localStorage.removeItem('atproto_state');
          localStorage.removeItem('atproto_refresh_token');
          
          // Check if there are any other localStorage items with 'atproto' in the key
          Object.keys(localStorage).forEach(key => {
            if (key.includes('atproto')) {
              console.log(`Removing localStorage item: ${key}`);
              localStorage.removeItem(key);
            }
          });
        } catch (clientErr) {
          console.error('Error clearing client storage:', clientErr);
        }
      } else {
        console.warn('No OAuth client available for logout');
      }
      
      // Force a reload to ensure all state is cleared
      console.log('Completing logout - reloading page');
      window.location.href = '/';
    } catch (err) {
      console.error('Logout process error:', err);
      // Still try to reload even if there are errors
      window.location.href = '/';
    }
  };

  // Check server-side authentication status with debounce
  const checkAuthStatus = useCallback(async () => {
    // Avoid concurrent auth checks
    if (authCheckInProgress.current) {
      return !!session;
    }

    // Rate limiting - prevent checks more frequently than every 3 seconds
    const now = Date.now();
    if (now - lastAuthCheck.current < 3000) {
      return !!session; // Return current auth state if called too frequently
    }

    authCheckInProgress.current = true;
    lastAuthCheck.current = now;

    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.isAuthenticated) {
        setSession(data.user);
        authCheckInProgress.current = false;
        return true;
      } else {
        setSession(null);
        authCheckInProgress.current = false;
        return false;
      }
    } catch (err) {
      console.error('Error checking auth status:', err);
      authCheckInProgress.current = false;
      return false;
    }
  }, [session]);

  return (
    <AuthContext.Provider 
      value={{ 
        session, 
        loading, 
        error,
        isAuthenticated: !!session,
        login, 
        logout,
        checkAuthStatus 
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