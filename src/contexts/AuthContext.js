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
  const didInitialCheck = useRef(false);

  // Initialize the OAuth client
  useEffect(() => {
    const initializeAuth = async () => {
      if (didInitialCheck.current) return;
      didInitialCheck.current = true;
      
      try {
        // First check server-side authentication status
        console.log('Checking server authentication status');
        const serverAuthResponse = await fetch('/api/auth/status', {
          credentials: 'include'
        });
        
        if (!serverAuthResponse.ok) {
          console.error('Server auth check failed with status:', serverAuthResponse.status);
        } else {
          const serverAuthData = await serverAuthResponse.json();
          console.log('Server auth status:', serverAuthData);
          
          if (serverAuthData.isAuthenticated || serverAuthData.authenticated) {
            console.log('Already authenticated on server, setting session');
            setSession(serverAuthData.user);
            setLoading(false);
            return;
          }
        }

        // If not authenticated on the server, check client OAuth
        console.log('Not authenticated on server, initializing OAuth client');
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
            
            // Check if atproto_session exists in localStorage as a backup
            const atprotoSession = localStorage.getItem('atproto_session');
            console.log('atproto_session in localStorage:', atprotoSession ? 'exists' : 'not found');
            
            // Try to extract handle from session
            let handle = result.session.handle;
            
            // If handle is missing, try to extract it from other sources
            if (!handle) {
              try {
                // Try server login data
                if (result.session.server && result.session.server.login && result.session.server.login.handle) {
                  handle = result.session.server.login.handle;
                } 
                // Try atproto_session in localStorage if it exists
                else if (atprotoSession) {
                  try {
                    const parsedSession = JSON.parse(atprotoSession);
                    if (parsedSession && parsedSession.handle) {
                      handle = parsedSession.handle;
                    }
                  } catch (e) {
                    console.error('Error parsing atproto_session:', e);
                  }
                }
              } catch (e) {
                console.error('Error extracting handle:', e);
              }
            }
            
            // Format session data for our internal use and sync with server
            const sessionData = {
              did: result.session.sub,
              handle: handle || 'unknown' // Ensure we always have a handle value
            };
            
            console.log('Syncing session with server:', sessionData);
            
            // Try to sync with server
            try {
              const syncResponse = await fetch('/api/sync-session', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(sessionData),
                credentials: 'include'
              });
              
              if (syncResponse.ok) {
                const syncData = await syncResponse.json();
                console.log('Initial session sync successful:', syncData);
                setSession(syncData.user);
              } else {
                console.warn('Initial session sync failed:', await syncResponse.text());
                
                // If sync fails, extract what we can from the result.session
                const handle = result.session.handle;
                
                // Try to get the handle from other properties if undefined
                let fallbackHandle = handle;
                if (!fallbackHandle) {
                  // Check if we can extract handle from other properties
                  try {
                    // If we have additional properties in the session that might contain the handle
                    if (result.session.server && result.session.server.login && result.session.server.login.handle) {
                      fallbackHandle = result.session.server.login.handle;
                    } else if (result.session.displayName && result.session.displayName.includes('@')) {
                      // Sometimes displayName has the handle
                      fallbackHandle = result.session.displayName.replace('@', '');
                    } else {
                      // Fallback to 'unknown' if we can't find a handle
                      fallbackHandle = 'unknown';
                    }
                  } catch (e) {
                    console.error('Error extracting handle from session:', e);
                    fallbackHandle = 'unknown';
                  }
                }
                
                // Log what we're doing
                console.log(`Using client session as fallback with handle: ${fallbackHandle}`);
                
                // Use client session in our internal format
                setSession({
                  did: result.session.sub,
                  handle: fallbackHandle,
                  displayName: result.session.displayName || fallbackHandle
                });
              }
            } catch (syncError) {
              console.error('Error syncing initial session:', syncError);
              
              // Extract handle with fallbacks similar to above
              const handle = result.session.handle;
              let fallbackHandle = handle;
              
              if (!fallbackHandle) {
                try {
                  if (result.session.server && result.session.server.login && result.session.server.login.handle) {
                    fallbackHandle = result.session.server.login.handle;
                  } else if (result.session.displayName && result.session.displayName.includes('@')) {
                    fallbackHandle = result.session.displayName.replace('@', '');
                  } else {
                    fallbackHandle = 'unknown';
                  }
                } catch (e) {
                  console.error('Error extracting handle from session:', e);
                  fallbackHandle = 'unknown';
                }
              }
              
              console.log(`Using client session after error with handle: ${fallbackHandle}`);
              
              // If sync fails, still use client session in our internal format
              setSession({
                did: result.session.sub,
                handle: fallbackHandle,
                displayName: result.session.displayName || fallbackHandle
              });
            }
          } else {
            console.log('No existing OAuth session found');
          }
          
          // Listen for session deletion events
          oauthClient.addEventListener('deleted', (event) => {
            console.log('Session deletion event received:', event.data);
            
            // Get current session DID at the time of event
            const currentSession = session;
            const sessionDid = currentSession?.did || currentSession?.sub;
            
            if (event.data.did === sessionDid) {
              console.log('Current session was deleted, logging out');
              setSession(null);
              
              // Also logout from server
              fetch('/api/logout', {
                method: 'POST',
                credentials: 'include'
              }).catch(err => {
                console.error('Error during server logout after deletion:', err);
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
      
      if (!response.ok) {
        console.error('Auth status check failed with status:', response.status);
        authCheckInProgress.current = false;
        return !!session; // Return current state on error
      }
      
      const data = await response.json();
      console.log('Auth status check response:', data);
      
      const isAuthenticated = data.isAuthenticated || data.authenticated;
      
      if (isAuthenticated && data.user) {
        // If server session is different from current session, update it
        const currentSessionJSON = session ? JSON.stringify(session) : '';
        const newSessionJSON = JSON.stringify(data.user);
        
        if (currentSessionJSON !== newSessionJSON) {
          console.log('Updating session from server data');
          setSession(data.user);
        }
        
        authCheckInProgress.current = false;
        return true;
      } else {
        // If server says not authenticated but we have a client session,
        // try to synchronize sessions
        if (session && client) {
          try {
            console.log('Server says not authenticated but we have a client session, trying to sync');
            
            // Extract handle from current session
            let handle = session.handle;
            if (!handle) {
              // If our session doesn't have a handle, try to extract from other properties
              try {
                if (session.displayName && typeof session.displayName === 'string') {
                  // Sometimes the handle might be in the displayName
                  handle = session.displayName.includes('@') ? 
                    session.displayName.replace('@', '') : 
                    session.displayName;
                }
              } catch (e) {
                console.error('Error extracting handle from session:', e);
              }
            }
            
            // Format session data properly
            const sessionData = {
              did: session.did || session.sub,
              handle: handle || 'unknown' // Always provide a handle value
            };
            
            console.log('Syncing with data:', sessionData);
            
            // Try to sync one more time
            const syncResponse = await fetch('/api/sync-session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(sessionData),
              credentials: 'include'
            });
            
            if (syncResponse.ok) {
              console.log('Session sync successful during status check');
              const syncData = await syncResponse.json();
              setSession(syncData.user);
              authCheckInProgress.current = false;
              return true;
            }
          } catch (syncError) {
            console.error('Error syncing during status check:', syncError);
          }
        }
        
        // If all attempts failed and the server says we're not authenticated
        console.log('Server says not authenticated, clearing session');
        setSession(null);
        authCheckInProgress.current = false;
        return false;
      }
    } catch (err) {
      console.error('Error checking auth status:', err);
      authCheckInProgress.current = false;
      return !!session; // Fall back to current session state
    }
  }, [session, client]);

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