// List of allowed DIDs and usernames
export const ALLOWED_ACCOUNTS = [
  'did:plc:gq4fo3u6tqzzdkjlwzpb23tj', // Dame's DID
  'dame.is' // Dame's handle
];

// Helper function to check if an account is allowed
export const isAccountAllowed = (session) => {
  console.log('Checking if account is allowed:', session);
  
  if (!session) {
    console.log('No session provided, denying access');
    return false;
  }
  
  // Extract DID from various possible session formats
  const did = session.did || session.sub || null;
  
  // Extract handle from various possible session formats
  const handle = session.handle || null;
  
  console.log(`Checking permissions for DID: ${did}, handle: ${handle}`);
  
  // Check if either did or handle is in the allowlist
  if (did && ALLOWED_ACCOUNTS.includes(did)) {
    console.log('DID is in allowlist, granting access');
    return true;
  }
  
  if (handle && ALLOWED_ACCOUNTS.includes(handle)) {
    console.log('Handle is in allowlist, granting access');
    return true;
  }
  
  // Also check if the handle (without domain) is in the allowlist
  if (handle && handle.includes('.')) {
    const handleWithoutDomain = handle.split('.')[0];
    if (ALLOWED_ACCOUNTS.includes(handleWithoutDomain)) {
      console.log('Handle (without domain) is in allowlist, granting access');
      return true;
    }
  }
  
  console.log('Account not in allowlist, denying access');
  return false;
}; 