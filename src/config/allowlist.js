// List of allowed DIDs and usernames
export const ALLOWED_ACCOUNTS = [
  'did:plc:gq4fo3u6tqzzdkjlwzpb23tj', // Dame's DID
  'dame.is' // Dame's handle
];

// Helper function to check if an account is allowed
export const isAccountAllowed = (session) => {
  if (!session) return false;
  
  // Check both DID and handle
  return ALLOWED_ACCOUNTS.includes(session.sub) || 
         ALLOWED_ACCOUNTS.includes(session.handle);
}; 