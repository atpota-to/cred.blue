import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext'; // Updated import path
import { Agent } from '@atproto/api';
import './Verifier.css'; // Updated CSS import

// Define trusted verifiers (updated list)
const TRUSTED_VERIFIERS = [
  'bsky.app',
  'nytimes.com',
  'wired.com',
  'theathletic.bsky.social'
];

// Helper function to fetch all paginated results using a specific agent instance
async function fetchAllPaginated(agentInstance, apiMethod, initialParams) {
  let results = [];
  let cursor = initialParams.cursor;
  const params = { ...initialParams };
  let operationName = apiMethod.name; // Get the name for logging

  // Attempt to determine a more specific name if bound
  if (apiMethod.name === 'bound dispatch') {
      const boundFnString = apiMethod.toString();
      // This is hacky, relies on internal representation which might change
      const match = boundFnString.match(/Target function: (\w+)/);
      if (match && match[1]) operationName = match[1];
  }

  do {
    try {
      if (cursor) {
        params.cursor = cursor;
      }
      // Call the method bound to the correct agent context
      const response = await apiMethod(params);
      const listKey = Object.keys(response.data).find(key => Array.isArray(response.data[key]));
      if (listKey && response.data[listKey]) {
          results = results.concat(response.data[listKey]);
      }
      cursor = response.data.cursor;
    } catch (error) {
      // Use the determined operation name in the error message
      console.error(`Error during paginated fetch for ${operationName}:`, error);
      cursor = undefined;
    }
  } while (cursor);

  return results;
}

// Updated function to get PDS endpoint from PLC directory OR well-known URI for did:web
async function getPdsEndpoint(did) {
  let didDocUrl;
  if (did.startsWith('did:plc:')) {
    didDocUrl = `https://plc.directory/${did}`;
  } else if (did.startsWith('did:web:')) {
    const domain = did.substring(8); // Extract domain after 'did:web:'
    // Decode percent-encoded characters in domain (e.g., for ports)
    const decodedDomain = decodeURIComponent(domain);
    didDocUrl = `https://${decodedDomain}/.well-known/did.json`;
  } else {
    console.warn(`Unsupported DID method for PDS lookup: ${did}`);
    return null;
  }

  try {
    console.log(`Fetching DID document from: ${didDocUrl}`); // Log the URL being fetched
    const response = await fetch(didDocUrl);
    if (!response.ok) {
      console.warn(`Could not resolve DID document for ${did} at ${didDocUrl}: ${response.status}`);
      return null;
    }
    const didDoc = await response.json();
    const service = didDoc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
    const endpoint = service?.serviceEndpoint || null;
    if (!endpoint) {
       console.warn(`No AtprotoPersonalDataServer service endpoint found in DID document for ${did}`);
    }
    return endpoint;
  } catch (error) {
    console.error(`Error fetching or parsing DID document for ${did} from ${didDocUrl}:`, error);
    return null;
  }
}

// --- Debounce Hook ---
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cancel the timeout if value changes (also on delay change or unmount)
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
// --- End Debounce Hook ---

// Renamed component to Verifier
function Verifier() {
  // Use the main app's AuthContext
  const { session, loading: isAuthLoading, error: authError, logout: signOut } = useAuth();
  const [targetHandle, setTargetHandle] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [agent, setAgent] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [verifications, setVerifications] = useState([]);
  const [isLoadingVerifications, setIsLoadingVerifications] = useState(false);
  const [networkVerifications, setNetworkVerifications] = useState({
    mutualsVerifiedMe: [],
    followsVerifiedMe: [],
    mutualsVerifiedAnyone: 0,
    followsVerifiedAnyone: 0,
    fetchedMutualsCount: 0,
    fetchedFollowsCount: 0,
  });
  const [isLoadingNetwork, setIsLoadingNetwork] = useState(false);
  const [networkChecked, setNetworkChecked] = useState(false);
  const [isCheckingValidity, setIsCheckingValidity] = useState(false);
  const [networkStatusMessage, setNetworkStatusMessage] = useState('');
  const [officialVerifiersStatus, setOfficialVerifiersStatus] = useState({}); // Stores status per verifier identifier

  // --- Autocomplete State --- (Keep as is)
  const [suggestions, setSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debouncedSearchTerm = useDebounce(targetHandle, 300); // 300ms debounce
  const suggestionsRef = useRef(null); // Ref for suggestions container
  const inputRef = useRef(null); // Ref for input field
  // --- End Autocomplete State ---

  useEffect(() => {
    // If session exists, create an Agent instance
    if (session) {
      // The session object from the main AuthContext might be structured differently.
      // Assuming it has an `accessJwt` and `did` (or `sub`)
      const agentInstance = new Agent({
         service: 'https://bsky.social', // Or get from session if available
         session: session // Pass the session object directly
      });
      setAgent(agentInstance);

      // Fetch logged-in user's profile info using the authenticated API
      agentInstance.api.app.bsky.actor.getProfile({ actor: session.did /* Ensure correct DID property */ })
        .then(res => {
          console.log('Logged-in user profile fetched successfully:', res.data);
          setUserInfo(res.data);
        })
        .catch(err => {
          console.error("Failed to fetch user profile:", err);
          // Attempt to use basic info from session as fallback
          setUserInfo({ handle: session.handle, displayName: session.displayName || session.handle, did: session.did });
        });
    } else {
      setAgent(null);
      setUserInfo(null);
    }
    // No redirection here, handled by main app routing if needed
  }, [session]);

  // Fetch all verification records created by the current user
  const fetchVerifications = async () => {
    if (!agent || !session) return;

    setIsLoadingVerifications(true);
    try {
      const response = await agent.api.com.atproto.repo.listRecords({
        repo: session.did, // Use session.did
        collection: 'app.bsky.graph.verification',
        limit: 100,
      });

      console.log('Fetched verifications:', response.data);

      // If we have records, set them in state
      if (response.data.records) {
        const formattedVerifications = response.data.records.map(record => ({
          uri: record.uri,
          cid: record.cid,
          handle: record.value.handle,
          displayName: record.value.displayName,
          subject: record.value.subject,
          createdAt: record.value.createdAt,
          isValid: true, // Default, will be checked later
          validityChecked: false
        }));
        setVerifications(formattedVerifications);

        // Check validity of each verification
        checkVerificationsValidity(formattedVerifications);
      } else {
        setVerifications([]);
      }
    } catch (error) {
      console.error('Failed to fetch verifications:', error);
      setStatusMessage(`Failed to load verifications: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoadingVerifications(false);
    }
  };

  // Check if verifications are still valid (handle/displayName still match)
  const checkVerificationsValidity = async (verificationsList) => {
    if (!agent || verificationsList.length === 0) return;

    setIsCheckingValidity(true);
    const updatedVerifications = [...verificationsList];

    try {
      // Process in batches to avoid too many concurrent requests
      const batchSize = 5;
      for (let i = 0; i < updatedVerifications.length; i += batchSize) {
        const batch = updatedVerifications.slice(i, i + batchSize);

        await Promise.all(batch.map(async (verification, index) => {
          try {
            // Get current profile data
            const profileRes = await agent.api.app.bsky.actor.getProfile({
              actor: verification.handle
            });

            // Check if handle and displayName still match
            const currentHandle = profileRes.data.handle;
            const currentDisplayName = profileRes.data.displayName || profileRes.data.handle;

            // Update verification validity
            const batchIndex = i + index;
            updatedVerifications[batchIndex].validityChecked = true;
            updatedVerifications[batchIndex].isValid =
              currentHandle === verification.handle &&
              currentDisplayName === verification.displayName;

            // If not valid, store current values for reference
            if (!updatedVerifications[batchIndex].isValid) {
              updatedVerifications[batchIndex].currentHandle = currentHandle;
              updatedVerifications[batchIndex].currentDisplayName = currentDisplayName;
            }

            // Update state as we go to show progress
            setVerifications([...updatedVerifications]);
          } catch (err) {
            console.error(`Failed to check validity for ${verification.handle}:`, err);
            // Mark as could not check
            const batchIndex = i + index;
            updatedVerifications[batchIndex].validityChecked = true;
            updatedVerifications[batchIndex].isValid = false;
            updatedVerifications[batchIndex].validityError = true;
          }
        }));
      }

      console.log('Verified all records validity:', updatedVerifications);
    } catch (error) {
      console.error('Failed to check verifications validity:', error);
    } finally {
      setIsCheckingValidity(false);
    }
  };

  // Updated function: Check mutuals (authenticated) and all follows (public)
  const checkNetworkVerifications = async () => {
    // Ensure authenticated agent is available for mutuals check
    if (!agent || !session || !userInfo) return;

    setIsLoadingNetwork(true);
    setNetworkChecked(false);
    // Reset state
    setNetworkVerifications({
        mutualsVerifiedMe: [], followsVerifiedMe: [],
        mutualsVerifiedAnyone: 0, followsVerifiedAnyone: 0,
        fetchedMutualsCount: 0, fetchedFollowsCount: 0
    });
    setNetworkStatusMessage("Fetching network lists (mutuals, follows)...");

    const publicAgent = new Agent({ service: 'https://public.api.bsky.app' });

    try {
      // Fetch follows (public) and known followers/mutuals (authenticated)
      const [follows, mutuals] = await Promise.all([
        fetchAllPaginated(publicAgent, publicAgent.api.app.bsky.graph.getFollows.bind(publicAgent.api.app.bsky.graph), { actor: session.did, limit: 100 }), // Use session.did
        // Use the main authenticated agent for getKnownFollowers
        fetchAllPaginated(agent, agent.api.app.bsky.graph.getKnownFollowers.bind(agent.api.app.bsky.graph), { actor: session.did, limit: 100 }) // Use session.did
      ]);

      console.log(`Fetched ${follows.length} follows (public), ${mutuals.length} mutuals (authenticated).`); // Updated log
      setNetworkStatusMessage(`Fetched ${follows.length} follows, ${mutuals.length} mutuals. Discovering PDS and checking verifications...`);

      // Update fetched counts
      setNetworkVerifications(prev => ({
        ...prev,
        fetchedMutualsCount: mutuals.length,
        fetchedFollowsCount: follows.length,
      }));

      const followsSet = new Set(follows.map(f => f.did));
      const mutualsSet = new Set(mutuals.map(m => m.did));

      const allProfilesMap = new Map();
      [...follows, ...mutuals].forEach(user => {
          if (!allProfilesMap.has(user.did)) {
              allProfilesMap.set(user.did, user);
          }
      });

      const uniqueUserDids = Array.from(allProfilesMap.keys());

      if (uniqueUserDids.length === 0) {
        setNetworkStatusMessage("No mutuals or follows found to check.");
        setIsLoadingNetwork(false);
        setNetworkChecked(true);
        return;
      }

      let results = {
        mutualsVerifiedMe: [], followsVerifiedMe: [],
        mutualsVerifiedAnyone: 0, followsVerifiedAnyone: 0
      };

      const batchSize = 5;
      for (let i = 0; i < uniqueUserDids.length; i += batchSize) {
        const batchDids = uniqueUserDids.slice(i, i + batchSize);
        setNetworkStatusMessage(`Checking network... (${i + batchDids.length}/${uniqueUserDids.length})`);

        await Promise.all(batchDids.map(async (did) => {
          const profile = allProfilesMap.get(did);
          if (!profile) return;

          const isMutual = mutualsSet.has(did);
          const isFollow = followsSet.has(did);

          const pdsEndpoint = await getPdsEndpoint(did);
          if (!pdsEndpoint) {
              console.warn(`Skipping verification check for ${profile.handle} (no PDS found).`);
              return;
          }

          let foundVerificationForMe = null;
          let hasVerifiedAnyone = false;
          let listRecordsCursor = undefined;

          do {
            try {
              const listParams = new URLSearchParams({ repo: did, collection: 'app.bsky.graph.verification', limit: '100' });
              if (listRecordsCursor) listParams.set('cursor', listRecordsCursor);
              const listRecordsUrl = `${pdsEndpoint}/xrpc/com.atproto.repo.listRecords?${listParams.toString()}`;
              const listResponse = await fetch(listRecordsUrl);
              if (!listResponse.ok) { break; }
              const listData = await listResponse.json();
              const records = listData.records || [];
              if (records.length > 0) {
                  hasVerifiedAnyone = true;
                  const matchingRecord = records.find(record => record.value?.subject === session.did); // Use session.did
                  if (matchingRecord) { foundVerificationForMe = matchingRecord; break; }
              }
              listRecordsCursor = listData.cursor;
            } catch (err) {
                console.error(`Network error fetching listRecords for ${did} from ${pdsEndpoint}:`, err);
                listRecordsCursor = undefined;
            }
          } while (listRecordsCursor);

          if (hasVerifiedAnyone) {
            if (isMutual) results.mutualsVerifiedAnyone++;
            if (isFollow) results.followsVerifiedAnyone++;
          }
          if (foundVerificationForMe) {
              const accountInfo = { ...profile, verification: foundVerificationForMe };
              if (isMutual) results.mutualsVerifiedMe.push(accountInfo);
              if (isFollow) results.followsVerifiedMe.push(accountInfo);
          }

        }));

        setNetworkVerifications(prev => ({
          ...prev,
          mutualsVerifiedMe: [...results.mutualsVerifiedMe],
          followsVerifiedMe: [...results.followsVerifiedMe],
          mutualsVerifiedAnyone: results.mutualsVerifiedAnyone,
          followsVerifiedAnyone: results.followsVerifiedAnyone,
        }));
      }

      console.log('Network check complete. Results:', results);
      setNetworkStatusMessage("Network verification check complete.");

    } catch (error) {
      // Catch errors from initial Promise.all or other setup issues
      console.error('Fatal error during network verification check:', error);
      setStatusMessage(`Fatal error checking network: ${error.message || 'Unknown error'}`);
      setNetworkStatusMessage("");
    } finally {
      setIsLoadingNetwork(false);
      setNetworkChecked(true);
    }
  };

  // Call fetchVerifications when agent is available
  useEffect(() => {
    if (agent) {
      fetchVerifications();
    }
  }, [agent]);

  // Updated function to check each official verifier individually
  const checkOfficialVerification = async () => {
    if (!agent || !session) return;

    // Initialize status for all verifiers to 'checking'
    const initialStatuses = {};
    TRUSTED_VERIFIERS.forEach(id => { initialStatuses[id] = 'checking'; });
    setOfficialVerifiersStatus(initialStatuses);

    const publicAgent = new Agent({ service: 'https://public.api.bsky.app' });

    // Use Promise.all to run checks concurrently (optional, but can be faster)
    await Promise.all(TRUSTED_VERIFIERS.map(async (verifierIdentifier) => {
      let verifierDid = null;
      let verifierHandle = verifierIdentifier;
      let currentStatus = 'checking'; // Status for this specific verifier

      try {
        // Resolve handle/DID
        if (!verifierIdentifier.startsWith('did:')) {
          const resolveResult = await publicAgent.resolveHandle({ handle: verifierIdentifier });
          verifierDid = resolveResult.data.did;
        } else {
          verifierDid = verifierIdentifier;
          try {
             const profileRes = await publicAgent.api.app.bsky.actor.getProfile({ actor: verifierDid });
             verifierHandle = profileRes.data.handle;
          } catch (profileError) { /* ignore */ }
        }
        if (!verifierDid) throw new Error('Could not resolve identifier');

        // Discover PDS
        const pdsEndpoint = await getPdsEndpoint(verifierDid);
        if (!pdsEndpoint) throw new Error('Could not find PDS');

        // Paginate through their listRecords
        let listRecordsCursor = undefined;
        let foundMatch = false;
        do {
          const listParams = new URLSearchParams({ repo: verifierDid, collection: 'app.bsky.graph.verification', limit: '100' });
          if (listRecordsCursor) listParams.set('cursor', listRecordsCursor);
          const listRecordsUrl = `${pdsEndpoint}/xrpc/com.atproto.repo.listRecords?${listParams.toString()}`;
          const listResponse = await fetch(listRecordsUrl);

          if (!listResponse.ok) {
             // Treat 400 (repo/collection not found) as simply not verified by this one
             if (listResponse.status !== 400) {
                console.warn(`Failed fetch for ${verifierHandle}: ${listResponse.status}`);
                throw new Error(`Fetch failed with status ${listResponse.status}`); // Throw for other errors
             }
             break; // Stop checking this verifier on 400 or other errors
          }

          const listData = await listResponse.json();
          const records = listData.records || [];
          const matchingRecord = records.find(record => record.value?.subject === session.did); // Use session.did

          if (matchingRecord) {
            console.log(`Found official verification by ${verifierHandle}`);
            currentStatus = 'verified';
            foundMatch = true;
            break; // Exit pagination loop for THIS verifier
          }
          listRecordsCursor = listData.cursor;
        } while (listRecordsCursor);

        // If loop completed without finding a match for this verifier
        if (!foundMatch) {
            currentStatus = 'not_verified';
        }

      } catch (error) {
        console.error(`Error checking official verifier ${verifierIdentifier}:`, error);
        currentStatus = 'error'; // Set status to error for this specific verifier
      }

      // Update the state for this specific verifier
      setOfficialVerifiersStatus(prev => ({ ...prev, [verifierIdentifier]: currentStatus }));

    })); // End Promise.all map

    console.log("Finished checking all official verifiers.");

  }; // End checkOfficialVerification

  // Effect to check official verification status on load
  useEffect(() => {
    // Run check when agent/session are ready
    if (agent && session?.did) { // Changed from session.sub
      checkOfficialVerification();
    }
    // Run once when agent/session become available
  }, [agent, session]);

  // --- Fetch Autocomplete Suggestions --- (Keep as is)
  const fetchSuggestions = useCallback(async (query) => {
    if (!query || query.trim().length < 2) { // Minimum 2 chars to search
      setSuggestions([]);
      // Don't explicitly setShowSuggestions(false) here, let onChange handle it
      return;
    }

    setIsFetchingSuggestions(true);
    // Don't set showSuggestions(true) here either, should be true already if we got here

    try {
      const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead');
      url.searchParams.append('q', query);
      url.searchParams.append('limit', '5'); // Fetch 5 suggestions

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Suggestions fetched:', data.actors);
      setSuggestions(data.actors || []);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]); // Clear suggestions on error
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, []);

  // Effect to fetch suggestions based on debounced search term AND if suggestions should be shown
  useEffect(() => {
    // Only fetch if the user is likely typing (suggestions are meant to be shown)
    // and the term is long enough.
    if (debouncedSearchTerm && showSuggestions) {
      fetchSuggestions(debouncedSearchTerm);
    } else if (!debouncedSearchTerm) { // Always clear if term is empty
      setSuggestions([]);
      // setShowSuggestions(false); // Let onChange handle hiding when empty
    }
    // If showSuggestions is false (e.g., after a click), this effect won't trigger a fetch.
  }, [debouncedSearchTerm, fetchSuggestions, showSuggestions]); // Add showSuggestions dependency

  // --- Click Outside Handler for Suggestions --- (Keep as is)
  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target) &&
          inputRef.current && !inputRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    // Bind the event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [suggestionsRef, inputRef]); // Add inputRef dependency
  // --- End Click Outside Handler ---

  // --- handleVerify --- (Keep as is)
  const handleVerify = async (e) => {
    e.preventDefault();
    if (!agent || !session) {
      setStatusMessage('Error: Not logged in or agent not initialized.');
      return;
    }
    if (!targetHandle) {
      setStatusMessage('Please enter a handle to verify.');
      return;
    }
    setIsVerifying(true);
    setStatusMessage(`Verifying ${targetHandle}...`);
    setShowSuggestions(false); // Hide suggestions when submitting

    try {
      // 1. Get profile of targetHandle (resolve handle to DID and get display name)
      setStatusMessage(`Fetching profile for ${targetHandle}...`);
      // Use the proper API namespace method
      const profileRes = await agent.api.app.bsky.actor.getProfile({ actor: targetHandle });
      const targetDid = profileRes.data.did;
      const targetDisplayName = profileRes.data.displayName || profileRes.data.handle;
      console.log('Target Profile:', profileRes.data);

      // 2. Construct the verification record object
      const verificationRecord = {
        $type: 'app.bsky.graph.verification', // Using the type you provided
        subject: targetDid,
        handle: targetHandle, // Include handle for context
        displayName: targetDisplayName, // Include display name
        createdAt: new Date().toISOString(),
      };
      console.log('Verification Record to Create:', verificationRecord);

      // 3. Create the record using the agent's com.atproto.repo.createRecord method
      setStatusMessage(`Creating verification record for ${targetHandle} on your profile...`);

      // The correct method is repo.createRecord, not createRecord
      const createRes = await agent.api.com.atproto.repo.createRecord({
        repo: session.did, // Use session.did
        collection: 'app.bsky.graph.verification', // The NSID of the record type
        record: verificationRecord,
      });

      console.log('Create Record Response:', createRes);

      // --- Construct Success Message with Intent Link --- (Keep as is)
      const verifiedHandle = targetHandle; // Capture handle for this success
      const postText = `I just verified @${verifiedHandle} using Bluesky's new decentralized verification system. Try verifying someone yourself using @cred.blue's new verification tool: https://cred.blue/verify`;
      const encodedText = encodeURIComponent(postText);
      const intentUrl = `https://bsky.app/intent/compose?text=${encodedText}`;

      const successMessageJSX = (
        <>
          Successfully created verification record for {verifiedHandle}!{' '}
          <a href={intentUrl} target="_blank" rel="noopener noreferrer" className="verifier-intent-link"> {/* Use plain class */} 
            Post on Bluesky to let them know.
          </a>
        </>
      );
      setStatusMessage(successMessageJSX); // Set JSX as status message
      // --- End Intent Link Construction ---

      setTargetHandle(''); // Clear input on success

      // Refresh the list of verifications
      fetchVerifications();

    } catch (error) {
      console.error('Verification failed:', error);
      setStatusMessage(`Verification failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsVerifying(false);
    }
  };
  // --- End handleVerify ---

  // Function to revoke (delete) a verification - (Keep as is)
  const handleRevoke = async (verification) => {
    if (!agent || !session) {
      setStatusMessage('Error: Not logged in or agent not initialized.');
      return;
    }

    setIsRevoking(true);
    setStatusMessage(`Revoking verification for ${verification.handle}...`);

    try {
      // Extract rkey from URI
      // URI format: at://did:plc:xxx/app.bsky.graph.verification/rkey
      const parts = verification.uri.split('/');
      const rkey = parts[parts.length - 1];

      await agent.api.com.atproto.repo.deleteRecord({
        repo: session.did, // Use session.did
        collection: 'app.bsky.graph.verification',
        rkey: rkey
      });

      console.log('Revoked verification for:', verification.handle);
      setStatusMessage(`Successfully revoked verification for ${verification.handle}`);

      // Refresh the list of verifications
      fetchVerifications();
    } catch (error) {
      console.error('Revocation failed:', error);
      setStatusMessage(`Revocation failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRevoking(false);
    }
  };

  // --- handleSuggestionClick --- (Keep as is)
  const handleSuggestionClick = (handle) => {
    setTargetHandle(handle);
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus(); // Keep focus on input after selection
  };
  // --- End handleSuggestionClick ---

  // AuthProvider handles redirection if not logged in during its initial load
  if (isAuthLoading) {
    return <p>Loading authentication...</p>;
  }

  if (authError) {
    return <p>Authentication Error: {authError}. <a href="/login">Please login</a>.</p>;
  }

  // Display message if session is not available but not loading/erroring
  if (!session && !isAuthLoading && !authError) {
     return (
        <div className="verifier-container">
           <h1>Bluesky Verifier Tool</h1>
           <p>Please <a href="/login">login with Bluesky</a> to use the verifier tool.</p>
        </div>
     );
  }

  // Update combined loading state
  const isAnyOperationInProgress = isVerifying || isRevoking || isLoadingVerifications || isLoadingNetwork || isCheckingValidity;

  // Update tooltip construction to use the (potentially resolved) handles
  const trustedVerifiersTooltip = `Checking if any of these Trusted Verifiers have created a verification record for your DID: ${TRUSTED_VERIFIERS.join(', ')}.`;

  // Use standard class names, not styles object
  return (
    <div className="verifier-container">
      <h1>Bluesky Verifier Tool</h1>
      <p className="verifier-intro-text">
        With Bluesky's new decentralized verification system, anyone can verify anyone else and any Bluesky client can choose which accounts to treat as "Trusted Verifiers". It's a first-of-its-kind verification system for a mainstream social platform of this size. Try verifying an account for yourself or check to see who has verified you!
      </p>
      <div className="verifier-page-header">
        <p className="verifier-user-info">Logged in as: {userInfo ? `${userInfo.displayName} (@${userInfo.handle})` : session?.did}</p> {/* Safely access session.did */} 
        <button
          onClick={signOut}
          disabled={isAnyOperationInProgress}
          className="verifier-sign-out-button"
        >
          Sign Out
        </button>
      </div>
      <hr />

      {/* Verification form */}
      <div className="verifier-section">
        <h2>Verify a Bluesky User</h2>
        <p>Enter the handle of the user you want to verify (e.g., targetuser.bsky.social):</p>
        {/* --- Input Container for Autocomplete Positioning --- */}
        <div className="verifier-input-container">
          <form onSubmit={handleVerify} className="verifier-form-container" style={{ marginBottom: 0 }}>
            <input
              ref={inputRef} // Assign ref
              type="text"
              value={targetHandle}
              onChange={(e) => {
                const newValue = e.target.value;
                setTargetHandle(newValue);
                if (newValue.length >= 2) {
                    setShowSuggestions(true);
                } else {
                    setShowSuggestions(false);
                    setSuggestions([]);
                }
              }}
              onFocus={() => {
                 if (targetHandle.length >= 2) {
                    setShowSuggestions(true);
                 }
              }}
              placeholder="targetuser.bsky.social"
              disabled={isAnyOperationInProgress}
              required
              className="verifier-input-field"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isVerifying || isRevoking || isLoadingVerifications || isLoadingNetwork || isCheckingValidity}
              className="verifier-submit-button"
            >
              {isVerifying ? 'Verifying...' : 'Create Verification Record'}
            </button>
          </form>
          {/* --- Suggestions Dropdown --- */}
          {showSuggestions && (suggestions.length > 0 || isFetchingSuggestions) && (
            <ul className="verifier-suggestions-list" ref={suggestionsRef}>
              {isFetchingSuggestions && suggestions.length === 0 ? (
                 <li className="verifier-suggestion-item">Loading...</li>
              ) : (
                suggestions.map((actor) => (
                  <li
                    key={actor.did}
                    className="verifier-suggestion-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSuggestionClick(actor.handle);
                    }}
                  >
                    <img src={actor.avatar} alt="" className="verifier-suggestion-avatar" />
                    <div className="verifier-suggestion-text">
                      <span className="verifier-suggestion-display-name">{actor.displayName || actor.handle}</span>
                      <span className="verifier-suggestion-handle">@{actor.handle}</span>
                    </div>
                  </li>
                ))
              )}
              {suggestions.length === 0 && !isFetchingSuggestions && targetHandle.length >= 2 && (
                 <li className="verifier-suggestion-item">No users found matching "{targetHandle}"</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Global Status message */}
      {statusMessage && (
        <div className={`
          verifier-status-box
          ${ typeof statusMessage === 'string' && (statusMessage.includes('failed') || statusMessage.includes('Error'))
              ? 'verifier-status-box-error'
              : 'verifier-status-box-success'
          }
        `}>
          <p>{statusMessage}</p>
        </div>
      )}

      {/* Updated Official Verifiers section */}
      <div className="verifier-section">
         <div style={{display: 'flex', alignItems: 'center', marginBottom: '10px'}}>
          <h2 style={{ display: 'inline-block', marginRight: '8px', marginBottom: 0, border: 'none', padding: 0 }}>Your Verification Status</h2>
          <span
            title={trustedVerifiersTooltip}
            className="verifier-official-verifier-tooltip"
            style={{ fontSize: '1.2em' }}
          >
            (?)
          </span>
        </div>

        {/* Map over trusted verifiers and display individual status */}
        <div>
          {TRUSTED_VERIFIERS.map(verifierId => {
            const status = officialVerifiersStatus[verifierId] || 'idle';
            let message = '...';
            let icon = '⏳';
            let statusClass = '';

            switch (status) {
              case 'checking':
                message = `Checking ${verifierId}...`;
                icon = '⏳';
                statusClass = 'verifier-checking-status';
                break;
              case 'verified':
                message = `Verified by ${verifierId}.`;
                icon = '✅';
                statusClass = 'verifier-verified-status';
                break;
              case 'not_verified':
                message = `Not verified by ${verifierId}.`;
                icon = '❌';
                statusClass = 'verifier-not-verified-status';
                break;
              case 'error':
                message = `Error checking ${verifierId}.`;
                icon = '⚠️';
                statusClass = 'verifier-error-status';
                break;
              default: // idle
                message = `Pending check for ${verifierId}.`;
                icon = '⏳';
                 statusClass = 'verifier-idle-status';
            }

            return (
              <p key={verifierId} className={`verifier-official-verifier-note ${statusClass}`}>
                {icon} {message}
              </p>
            );
          })}
        </div>
      </div>

      {/* Updated section for Network Verifications */}
      <div className="verifier-section">
        <div className="verifier-list-header">
          <h2>Who's Verified You?</h2>
          <button
            onClick={checkNetworkVerifications}
            disabled={isAnyOperationInProgress}
            className="verifier-action-button verifier-check-network-button"
          >
            {isLoadingNetwork ? 'Checking Network...' : 'Check Network Now'}
          </button>
        </div>

        {/* Display local status message */}
        {(isLoadingNetwork || networkStatusMessage) && (
          <p className="verifier-network-status">{networkStatusMessage}</p>
        )}

        {!isLoadingNetwork && networkChecked && (
          <div className="verifier-network-results">
            {/* --- Mutuals Verified Me --- */}
            <p>
              {networkVerifications.mutualsVerifiedMe.length > 0
                ? `${networkVerifications.mutualsVerifiedMe.length} mutual(s) have verified you:`
                : "None of your mutuals have verified you yet."}
            </p>
            {networkVerifications.mutualsVerifiedMe.length > 0 && (
              <ul className="verifier-verifier-list">
                {networkVerifications.mutualsVerifiedMe.map(account => (
                  <li key={account.did}>
                    {account.displayName} (@{account.handle})
                  </li>
                ))}
              </ul>
            )}

            {/* --- Follows Verified Me --- */}
            <p style={{marginTop: '15px'}}>
              {networkVerifications.followsVerifiedMe.length > 0
                ? `${networkVerifications.followsVerifiedMe.length} account(s) you follow have verified you:`
                : "None of the accounts you follow have verified you yet."}
            </p>
             {networkVerifications.followsVerifiedMe.length > 0 && (
              <ul className="verifier-verifier-list">
                {networkVerifications.followsVerifiedMe.map(account => (
                  <li key={account.did}>
                     {account.displayName} (@{account.handle})
                  </li>
                ))}
              </ul>
            )}

            {/* --- Additional Context - Verified Others --- */}
            <div className="verifier-additional-context">
                 <p>
                   {networkVerifications.mutualsVerifiedAnyone} of your {networkVerifications.fetchedMutualsCount} fetched mutuals have verified others.
                </p>
                <p>
                   {networkVerifications.followsVerifiedAnyone} of the {networkVerifications.fetchedFollowsCount} accounts you follow have verified others.
                </p>
            </div>

            {/* --- Network Stats Share Link --- */}
            {(() => { // IIFE to encapsulate logic
              const statsText = `Here are my expanded verification stats:\n\n` +
                                `${networkVerifications.mutualsVerifiedMe.length} of my mutuals have verified me\n` +
                                `${networkVerifications.followsVerifiedMe.length} account(s) that I follow have verified me\n` +
                                `${networkVerifications.mutualsVerifiedAnyone} of my ${networkVerifications.fetchedMutualsCount} mutuals have verified others\n` +
                                `${networkVerifications.followsVerifiedAnyone} of the ${networkVerifications.fetchedFollowsCount} accounts I follow have verified others\n\n` +
                                `See who in your network has verified you here: https://cred.blue/verify`;
              const encodedStatsText = encodeURIComponent(statsText);
              const statsIntentUrl = `https://bsky.app/intent/compose?text=${encodedStatsText}`;

              return (
                <a
                  href={statsIntentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="verifier-share-stats-link"
                >
                  Share your verification stats on Bluesky!
                </a>
              );
            })()}

          </div>
        )}
        {!isLoadingNetwork && !networkChecked && (
           <p>Click "Check Network Now" to see verifications from your network.</p>
        )}
      </div>

      {/* List of verified accounts */}
      <div className="verifier-section">
        <div className="verifier-list-header">
          <h2>Accounts You've Verified</h2>
          <button
            onClick={() => fetchVerifications()}
            disabled={isAnyOperationInProgress}
            className="verifier-action-button verifier-refresh-button"
          >
            Refresh List
          </button>
        </div>
        {isLoadingVerifications ? (
          <p>Loading verifications...</p>
        ) : verifications.length === 0 ? (
          <p>You haven't verified any accounts yet.</p>
        ) : (
          <ul className="verifier-list">
            {verifications.map((verification) => (
              <li
                key={verification.uri}
                className={`
                  verifier-list-item
                  ${verification.validityChecked && !verification.isValid ? 'verifier-list-item-invalid' : ''}
                `}
              >
                <div className="verifier-list-item-content">
                  <div style={{ fontWeight: 'bold' }}>{verification.displayName}</div>
                  <div className="verifier-list-item-handle">@{verification.handle}</div>
                  <div className="verifier-list-item-date">
                    Verified: {new Date(verification.createdAt).toLocaleString()}
                  </div>

                  {verification.validityChecked && !verification.isValid && (
                    <div className="verifier-validity-warning">
                      {verification.validityError ? (
                        <p>⚠️ Could not verify current profile data</p>
                      ) : (
                        <>
                          <p><strong>⚠️ Profile has changed since verification</strong></p>
                          <p>
                            <span>Current handle: @{verification.currentHandle}</span><br />
                            <span>Current display name: {verification.currentDisplayName}</span>
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="verifier-list-item-actions">
                  <button
                    onClick={() => handleRevoke(verification)}
                    disabled={isAnyOperationInProgress}
                    className="verifier-revoke-button"
                  >
                    {isRevoking ? 'Revoking...' : 'Revoke Verification'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Verifier; 