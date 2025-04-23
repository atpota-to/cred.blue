import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Agent } from '@atproto/api';
import './Verifier.css';

// Define trusted verifiers (updated list)
const TRUSTED_VERIFIERS = [
  'bsky.app',
  'nytimes.com',
  'wired.com',
  'theathletic.bsky.social'
];

// Helper function modified to handle direct fetch or agent calls
// Now accepts an optional 'useDirectFetch' flag and the direct URL if needed
// And accepts apiContext and methodName for correct 'this' binding
async function fetchAllPaginated(apiContext, methodName, initialParams, useDirectFetch = false, directUrl = null) {
  let results = [];
  let cursor = initialParams.cursor;
  const params = { ...initialParams }; // Copy initial params
  // Determine operation name
  const operationName = methodName || (directUrl || 'directFetch');
  console.log(`fetchAllPaginated: Starting ${operationName} with initialParams:`, initialParams);

  let currentUrl = directUrl; // Use direct URL if provided

  do {
    try {
      let responseData;
      if (useDirectFetch && currentUrl) {
        // Handle pagination for direct fetch
        const url = new URL(currentUrl);
        if (cursor) {
          url.searchParams.set('cursor', cursor);
        }
        // Add other params like limit (ensure initialParams doesn't duplicate)
        Object.entries(params).forEach(([key, value]) => {
           if (key !== 'cursor' && !url.searchParams.has(key)) {
              url.searchParams.set(key, value);
           }
        });
        // console.log(`fetchAllPaginated: Direct fetch URL: ${url.toString()}`);
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        responseData = await response.json();
      } else if (apiContext && methodName) {
        // Use agent method with correct context
        if (cursor) {
          params.cursor = cursor;
        }
        // Call the method using the provided context
        const response = await apiContext[methodName](params);
        if (!response || !response.data) {
            console.warn(`fetchAllPaginated: Invalid agent response for ${operationName}`, response);
            break;
        }
        responseData = response.data;
      } else {
         console.error("fetchAllPaginated: Called without apiContext/methodName or direct URL");
         break;
      }

      // Find results array
      const listKey = Object.keys(responseData).find(key => Array.isArray(responseData[key]));
      if (listKey && responseData[listKey]) {
        results = results.concat(responseData[listKey]);
      }
      cursor = responseData.cursor;

    } catch (error) {
      console.error(`Error during paginated fetch for ${operationName}:`, error);
      cursor = undefined;
    }
  } while (cursor);

  console.log(`fetchAllPaginated: Finished ${operationName}, total items: ${results.length}`);
  return results;
}

// Updated function to get PDS endpoint from PLC directory OR well-known URI for did:web
async function getPdsEndpoint(did) {
  let didDocUrl;
  if (did.startsWith('did:plc:')) {
    didDocUrl = `https://plc.directory/${did}`;
  } else if (did.startsWith('did:web:')) {
    const domain = did.substring(8); // Extract domain after 'did:web:'
    const decodedDomain = decodeURIComponent(domain);
    didDocUrl = `https://${decodedDomain}/.well-known/did.json`;
  } else {
    console.warn(`Unsupported DID method for PDS lookup: ${did}`);
    return null;
  }

  try {
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

// Renamed component to Verifier
function Verifier() {
  // Use the main app's AuthContext
  const { session, loading: isAuthLoading, error: authError, logout: signOut, isAuthenticated } = useAuth();
  const [targetHandle, setTargetHandle] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [revokeStatusMessage, setRevokeStatusMessage] = useState('');
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
  const [officialVerifiersStatus, setOfficialVerifiersStatus] = useState({});
  const [suggestions, setSuggestions] = useState([]); // State for typeahead suggestions
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false); // State for suggestion loading indicator
  const [showSuggestions, setShowSuggestions] = useState(false); // Control suggestion list visibility
  const debounceTimeoutRef = useRef(null); // Ref for debounce timer
  const suggestionListRef = useRef(null); // Ref for suggestion list to handle clicks outside

  // State for list verification
  const [verifyMode, setVerifyMode] = useState('single'); // 'single' or 'list'
  const [userLists, setUserLists] = useState([]);
  const [selectedListUri, setSelectedListUri] = useState('');
  const [isFetchingLists, setIsFetchingLists] = useState(false);
  const [bulkVerifyStatus, setBulkVerifyStatus] = useState(''); // Status message for bulk operations
  const [bulkVerifyProgress, setBulkVerifyProgress] = useState(''); // Progress indicator (e.g., "10/50")

  // State for list revocation
  const [revokeMode, setRevokeMode] = useState('single'); // 'single' or 'list' or 'time'
  const [selectedListUriForRevoke, setSelectedListUriForRevoke] = useState('');
  const [bulkRevokeStatus, setBulkRevokeStatus] = useState(''); // Status message for bulk revoke
  const [bulkRevokeProgress, setBulkRevokeProgress] = useState(''); // Progress for bulk revoke

  // State for filtering verified accounts
  const [verificationSearchTerm, setVerificationSearchTerm] = useState('');

  // State for time-based revocation
  const [revokeTimeRange, setRevokeTimeRange] = useState('30m'); // Default: 30 minutes

  // State for verification list pagination
  const [verificationsCursor, setVerificationsCursor] = useState(null);
  const [isLoadingMoreVerifications, setIsLoadingMoreVerifications] = useState(false);

  // Verification options
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const followsListUri = 'special:follows'; // Constant for the special URI

  useEffect(() => {
    if (session) {
      const agentInstance = new Agent(session);
      setAgent(agentInstance);

      agentInstance.api.app.bsky.actor.getProfile({ actor: session.did })
        .then(res => {
          console.log('Logged-in user profile fetched successfully:', res.data);
          setUserInfo(res.data);
        })
        .catch(err => {
          console.error("Failed to fetch user profile:", err);
          setUserInfo({ handle: session.handle, displayName: session.displayName || session.handle, did: session.did });
        });
    } else {
      setAgent(null);
      setUserInfo(null);
    }
  }, [session]);

  // Define checkVerificationsValidity *before* fetchVerifications because fetchVerifications depends on it
  const checkVerificationsValidity = useCallback(async (verificationsList) => {
    if (!verificationsList || verificationsList.length === 0) {
        console.log("checkVerificationsValidity called with empty or null list.");
        return; // Exit early if list is empty
    }

    setIsCheckingValidity(true);
    // Create a mutable copy to update status
    const updatedVerifications = verificationsList.map(v => ({ ...v })); 
    try {
      const batchSize = 5;
      for (let i = 0; i < updatedVerifications.length; i += batchSize) {
        const batch = updatedVerifications.slice(i, i + batchSize);
        await Promise.all(batch.map(async (verification, index) => {
          const batchIndex = i + index;
          try {
            // *** Get the specific PDS for the verified user ***
            const targetDid = verification.subject;
            /* // Remove PDS lookup - use public API instead
            const pdsEndpoint = await getPdsEndpoint(targetDid);

            if (!pdsEndpoint) {
              throw new Error(`Could not find PDS for ${verification.handle || targetDid}`);
            }
            */

            // *** Use direct fetch from the public AppView to get the profile ***
            const publicApiBase = 'https://public.api.bsky.app';
            const profileUrl = `${publicApiBase}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(targetDid)}`;
            const profileResponse = await fetch(profileUrl);

            if (!profileResponse.ok) {
                // If profile fetch fails (e.g., 404), mark validity check failed
                throw new Error(`Failed to fetch profile from public API: ${profileResponse.status}`);
            }
            const profileData = await profileResponse.json();

            // Check if handle and displayName still match
            const currentHandle = profileData.handle;
            const currentDisplayName = profileData.displayName || profileData.handle;

            updatedVerifications[batchIndex].validityChecked = true;
            updatedVerifications[batchIndex].isValid =
              currentHandle === verification.handle &&
              currentDisplayName === verification.displayName;

            if (!updatedVerifications[batchIndex].isValid) {
              updatedVerifications[batchIndex].currentHandle = currentHandle;
              updatedVerifications[batchIndex].currentDisplayName = currentDisplayName;
            }
          } catch (err) {
            console.error(`Failed to check validity for ${verification.handle || verification.subject}:`, err);
            updatedVerifications[batchIndex].validityChecked = true;
            updatedVerifications[batchIndex].isValid = false;
            updatedVerifications[batchIndex].validityError = true;
          }
        }));
        // Update state after each batch completes to reflect progress
        // Use functional update to ensure we're working with the latest state
        setVerifications(prev => 
           prev.map(v => updatedVerifications.find(uv => uv.uri === v.uri) || v)
        );
      }
      console.log('Verified all records validity (batch processed):', updatedVerifications);
    } catch (error) {
      console.error('Error during batch processing for validity check:', error);
    } finally {
      setIsCheckingValidity(false);
    }
  }, []); // Empty dependency array is likely correct as setters are stable & getPdsEndpoint is global

  const fetchVerifications = useCallback(async (cursor) => {
    if (!agent || !session) return;
    
    // Determine loading state based on whether a cursor is provided
    if (cursor) {
        setIsLoadingMoreVerifications(true);
    } else {
        setIsLoadingVerifications(true);
        setVerifications([]); // Clear existing on initial fetch
        setVerificationsCursor(null); // Reset cursor on initial fetch
    }

    try {
      const params = {
        repo: session.did,
        collection: 'app.bsky.graph.verification',
        limit: 100, // Keep fetching 100 at a time
      };
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await agent.api.com.atproto.repo.listRecords(params);
      console.log('Fetched verifications page:', response.data);

      if (response.data.records && response.data.records.length > 0) {
        const newFormatted = response.data.records.map(record => ({
          uri: record.uri,
          cid: record.cid,
          handle: record.value.handle,
          displayName: record.value.displayName,
          subject: record.value.subject,
          createdAt: record.value.createdAt,
          isValid: true, // Assume valid initially
          validityChecked: false
        }));

        // Append if loading more, replace if initial fetch
        setVerifications(prevVerifications => 
            cursor ? [...prevVerifications, ...newFormatted] : newFormatted
        );
        setVerificationsCursor(response.data.cursor || null); // Store the new cursor

        // Get the updated list *after* state update (or construct it)
        const updatedVerifications = cursor ? [...verifications, ...newFormatted] : newFormatted;

        // Check validity for the entire updated list
        // Consider optimizing this later if performance is an issue
        checkVerificationsValidity(updatedVerifications);
      } else {
         // If initial fetch resulted in no records, ensure list is empty
         if (!cursor) {
            setVerifications([]);
            setVerificationsCursor(null);
         }
         // If loading more resulted in no records, just clear the cursor
         if (cursor) {
            setVerificationsCursor(null);
         }
      }
    } catch (error) {
      console.error('Failed to fetch verifications:', error);
      // Use appropriate status based on load type
      const statusMsg = `Failed to load verifications: ${error.message || 'Unknown error'}`;
      if(cursor) setRevokeStatusMessage(statusMsg); // Show error near list
      else setStatusMessage(statusMsg); // Show error near top form
    } finally {
        if (cursor) {
             setIsLoadingMoreVerifications(false);
        } else {
            setIsLoadingVerifications(false);
        }
    }
    // Note: Removing 'verifications' from dependency array to prevent potential infinite loop
    // The logic relies on setVerifications using the functional update form or constructing the new list manually.
  }, [agent, session, checkVerificationsValidity]);

  const checkNetworkVerifications = useCallback(async () => {
    if (!agent || !session || !userInfo) {
      console.warn("checkNetworkVerifications: Agent, session, or userInfo not available.");
      return;
    }
    setIsLoadingNetwork(true);
    setNetworkChecked(false);
    setNetworkVerifications({ mutualsVerifiedMe: [], followsVerifiedMe: [], mutualsVerifiedAnyone: 0, followsVerifiedAnyone: 0, fetchedMutualsCount: 0, fetchedFollowsCount: 0 });
    setNetworkStatusMessage("Fetching network lists (mutuals, follows)...");

    try {
      console.log("checkNetworkVerifications: Fetching follows (public) and attempting direct getKnownFollowers...");

      // Fetch follows using direct fetch
      const followsUrl = `https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows`;
      const followsParams = { actor: session.did, limit: 100 };
      const follows = await fetchAllPaginated(null, null, followsParams, true, followsUrl);

      // *** Fetch Known Followers Directly (First Page Only for Test) ***
      let mutuals = [];
      try {
        const knownFollowersResponse = await agent.api.app.bsky.graph.getKnownFollowers({
            actor: session.did,
            limit: 100 // Fetch first page
        });
        if (knownFollowersResponse?.data?.followers) {
            mutuals = knownFollowersResponse.data.followers;
            console.log(`Direct getKnownFollowers call successful, got ${mutuals.length} mutuals.`);
        } else {
             console.warn("Direct getKnownFollowers call returned unexpected structure:", knownFollowersResponse);
        }
      } catch (knownFollowersError) {
          console.error("Direct getKnownFollowers call failed:", knownFollowersError);
          // Set status message to indicate failure for this part
          setNetworkStatusMessage("Failed to fetch mutuals/known followers.");
          // Optionally, proceed without mutuals or stop the check
          // For now, let's continue with just follows if mutuals failed
      }

      // Now mutuals contains only the first page, or is empty on error.
      // The rest of the logic will proceed, but mutuals data might be incomplete or missing.

      console.log(`checkNetworkVerifications: Fetched ${follows.length} follows, ${mutuals.length} known followers (first page).`);
      setNetworkStatusMessage(`Processing ${follows.length} follows and ${mutuals.length} known followers...`);
      setNetworkVerifications(prev => ({ ...prev, fetchedMutualsCount: mutuals.length, fetchedFollowsCount: follows.length }));

      const followsSet = new Set(follows.map(f => f.did));
      const mutualsSet = new Set(mutuals.map(m => m.did));
      const allProfilesMap = new Map();
      [...follows, ...mutuals].forEach(user => { if (user && user.did && !allProfilesMap.has(user.did)) allProfilesMap.set(user.did, user); });
      const uniqueUserDids = Array.from(allProfilesMap.keys());

      if (uniqueUserDids.length === 0) {
        setNetworkStatusMessage("No mutuals or follows found.");
        setIsLoadingNetwork(false);
        setNetworkChecked(true);
        return;
      }

      console.log(`checkNetworkVerifications: Checking ${uniqueUserDids.length} unique users...`);
      let results = { mutualsVerifiedMe: [], followsVerifiedMe: [], mutualsVerifiedAnyone: 0, followsVerifiedAnyone: 0 };
      const batchSize = 10;

      for (let i = 0; i < uniqueUserDids.length; i += batchSize) {
        const batchDids = uniqueUserDids.slice(i, i + batchSize);
        setNetworkStatusMessage(`Checking verification records... (${i + batchDids.length}/${uniqueUserDids.length})`);

        const batchPromises = batchDids.map(async (did) => {
          const profile = allProfilesMap.get(did);
          if (!profile) return null;
          const isMutual = mutualsSet.has(did);
          const isFollow = followsSet.has(did);

          const pdsEndpoint = await getPdsEndpoint(did);
          if (!pdsEndpoint) {
            console.warn(`Skipping verification check for ${profile.handle || did} (no PDS found).`);
            return null;
          }

          let foundVerificationForMe = null;
          let hasVerifiedAnyone = false;

          try {
            // *** Use fetchAllPaginated with direct fetch for listRecords ***
            const listRecordsUrl = `${pdsEndpoint}/xrpc/com.atproto.repo.listRecords`;
            const listRecordsParams = { repo: did, collection: 'app.bsky.graph.verification', limit: 100 };

            const verificationRecords = await fetchAllPaginated(
              null,
              null,
              listRecordsParams,
              true, // Use direct fetch
              listRecordsUrl
            );

            if (verificationRecords.length > 0) {
              hasVerifiedAnyone = true;
              // Check if any record verifies the logged-in user
              const matchingRecord = verificationRecords.find(record => record.value?.subject === session.did);
              if (matchingRecord) {
                foundVerificationForMe = matchingRecord;
              }
            }
          } catch (err) {
             console.warn(`Error processing records for ${profile?.handle || did} on ${pdsEndpoint}:`, err);
          }
          
          // Return data for aggregation
          return {
             isMutual,
             isFollow,
             profile,
             hasVerifiedAnyone,
             foundVerificationForMe
          };
        });

        // Process results from the batch
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(result => {
           if (!result) return; // Skip if PDS lookup failed or other issue
           if (result.hasVerifiedAnyone) {
              if (result.isMutual) results.mutualsVerifiedAnyone++;
              if (result.isFollow) results.followsVerifiedAnyone++;
           }
           if (result.foundVerificationForMe) {
              const accountInfo = { ...result.profile, verification: result.foundVerificationForMe };
              if (result.isMutual) results.mutualsVerifiedMe.push(accountInfo);
              if (result.isFollow) results.followsVerifiedMe.push(accountInfo);
           }
        });

        // Update state incrementally after each batch
        setNetworkVerifications(prev => ({
          ...prev,
          mutualsVerifiedMe: [...results.mutualsVerifiedMe],
          followsVerifiedMe: [...results.followsVerifiedMe],
          mutualsVerifiedAnyone: results.mutualsVerifiedAnyone,
          followsVerifiedAnyone: results.followsVerifiedAnyone,
        }));
      }

      console.log('checkNetworkVerifications: Check complete.', results);
      setNetworkStatusMessage("Network verification check complete.");

    } catch (error) {
      console.error('Error during network verification check:', error);
      setStatusMessage(`Error checking network: ${error.message || 'Unknown error'}`);
      setNetworkStatusMessage("");
    } finally {
      setIsLoadingNetwork(false);
      setNetworkChecked(true);
      setNetworkStatusMessage('');
    }
  }, [agent, session, userInfo]);

  // Function to fetch user's lists
  const fetchUserLists = useCallback(async () => {
    if (!agent || !session?.did) {
        console.warn("fetchUserLists: Agent or session.did not available.");
        return;
    }
    setIsFetchingLists(true);
    setUserLists([]); // Clear previous lists
    setStatusMessage(''); // Clear general status
    setBulkVerifyStatus('Fetching your lists...'); // Use bulk status for list fetching message
    try {
        const lists = await fetchAllPaginated(
            agent.api.app.bsky.graph, // The context object
            'getLists', // The method name as a string
            { actor: session.did, limit: 100 }, // Initial parameters
            false // Not using direct fetch here
        );
        console.log(`Fetched ${lists.length} lists for user ${session.handle}`);
        
        // Prepend the special "Follows" list
        const followsPseudoList = {
            uri: 'special:follows',
            name: 'My Follows',
            // Use follows count from userInfo if available
            listItemCount: userInfo?.followsCount ?? 0 // Default to 0 if not found
        };

        setUserLists([followsPseudoList, ...(lists || [])]); // Add follows list at the beginning

        if (lists.length === 0) {
             // Adjust status message if only the pseudo-list exists
             setBulkVerifyStatus('You have not created any custom lists yet.'); 
        } else {
             setBulkVerifyStatus(''); // Clear status on success if lists were found
        }
    } catch (error) {
        console.error('Failed to fetch user lists:', error);
        setBulkVerifyStatus(`Failed to fetch lists: ${error.message || 'Unknown error'}`);
    } finally {
        setIsFetchingLists(false);
        // Clear status if it was just 'Fetching...' and no error occurred but no lists found
        if (!bulkVerifyStatus.includes('Failed') && !bulkVerifyStatus.includes('You have not created')) {
            setBulkVerifyStatus('');
        }
    }
  }, [agent, session, userInfo]);

  useEffect(() => {
    if (agent && userInfo) { // Wait for both agent and userInfo
      fetchVerifications(); // Initial fetch (no cursor)
      fetchUserLists(); // Fetch lists when agent and userInfo are ready
    }
    // Intentionally not depending on fetchVerifications/fetchUserLists to avoid loops if they change identity
    // We only want this effect to run when agent or userInfo changes.
  }, [agent, userInfo, fetchVerifications, fetchUserLists]); // Add userInfo dependency

  const checkOfficialVerification = useCallback(async () => {
    if (!session?.did) return;
    const initialStatuses = {};
    TRUSTED_VERIFIERS.forEach(id => { initialStatuses[id] = 'checking'; });
    setOfficialVerifiersStatus(initialStatuses);
    // No need for publicAgent instance here
    // const publicAgent = new Agent({ service: 'https://public.api.bsky.app' });

    await Promise.all(TRUSTED_VERIFIERS.map(async (verifierIdentifier) => {
      let verifierDid = null;
      let verifierHandle = verifierIdentifier;
      let currentStatus = 'checking';
      try {
        // Resolve handle using direct fetch if necessary
        if (!verifierIdentifier.startsWith('did:')) {
          const resolveUrl = `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(verifierIdentifier)}`;
          const resolveResponse = await fetch(resolveUrl);
          if (!resolveResponse.ok) throw new Error(`Resolve handle failed: ${resolveResponse.status}`);
          const resolveData = await resolveResponse.json();
          verifierDid = resolveData.did;
        } else {
          verifierDid = verifierIdentifier;
          // Optionally fetch profile handle for display using direct fetch
          try {
            const profileUrl = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(verifierDid)}`;
            const profileResponse = await fetch(profileUrl);
            if (profileResponse.ok) {
                const profileData = await profileResponse.json();
                verifierHandle = profileData.handle;
            }
          } catch { /* ignore */ }
        }

        if (!verifierDid) throw new Error('Could not resolve identifier');
        const pdsEndpoint = await getPdsEndpoint(verifierDid);
        if (!pdsEndpoint) throw new Error('Could not find PDS');

        let listRecordsCursor = undefined;
        let foundMatch = false;
        // No agent needed here, use fetch
        do {
          try {
            const listParams = new URLSearchParams({ repo: verifierDid, collection: 'app.bsky.graph.verification', limit: '100' });
            if (listRecordsCursor) listParams.set('cursor', listRecordsCursor);
            // *** Use direct fetch for listRecords ***
            const listRecordsUrl = `${pdsEndpoint}/xrpc/com.atproto.repo.listRecords?${listParams.toString()}`;
            const listResponse = await fetch(listRecordsUrl);

            if (!listResponse.ok) {
               if (listResponse.status !== 400) {
                  console.warn(`Failed fetch for ${verifierHandle}: ${listResponse.status}`);
                  throw new Error(`Fetch failed with status ${listResponse.status}`);
               }
               break; // Stop on 400 or other errors
            }

            const listData = await listResponse.json();
            const records = listData.records || [];
            const matchingRecord = records.find(record => record.value?.subject === session.did);
            if (matchingRecord) {
              currentStatus = 'verified';
              foundMatch = true;
              break;
            }
            listRecordsCursor = listData.cursor;
          } catch (err) {
             console.warn(`Could not listRecords for ${verifierDid} on ${pdsEndpoint}:`, err.message);
             listRecordsCursor = undefined;
             break;
          }
        } while (listRecordsCursor);
        if (!foundMatch && currentStatus === 'checking') {
            currentStatus = 'not_verified';
        }
      } catch (error) {
        console.error(`Error checking official verifier ${verifierIdentifier}:`, error);
        currentStatus = 'error';
      }
      setOfficialVerifiersStatus(prev => ({ ...prev, [verifierIdentifier]: currentStatus }));
    }));
    console.log("Finished checking all official verifiers.");
  }, [session]);

  useEffect(() => {
    if (session?.did) {
      checkOfficialVerification();
    }
  }, [session, checkOfficialVerification]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!agent || !session) return;
    if (!targetHandle) return;
    setIsVerifying(true);
    setStatusMessage(`Verifying ${targetHandle}...`);
    setRevokeStatusMessage('');
    try {
      const profileRes = await agent.api.app.bsky.actor.getProfile({ actor: targetHandle });
      const targetDid = profileRes.data.did;
      const targetDisplayName = profileRes.data.displayName || profileRes.data.handle;

      // Check for duplicates if skipDuplicates is enabled
      if (skipDuplicates && verifications.some(v => v.subject === targetDid)) {
        setStatusMessage(`Verification for ${targetHandle} already exists. Skipped.`);
        setIsVerifying(false);
        return;
      }

      const verificationRecord = {
        $type: 'app.bsky.graph.verification',
        subject: targetDid,
        handle: targetHandle,
        displayName: targetDisplayName,
        createdAt: new Date().toISOString(),
      };
      await agent.api.com.atproto.repo.createRecord({
        repo: session.did,
        collection: 'app.bsky.graph.verification',
        record: verificationRecord,
      });
      const postText = `I just verified @${targetHandle} using Bluesky's new verification system. Try verifying someone yourself using @cred.blue's verifier tool: https://cred.blue/verifier`;
      const encodedText = encodeURIComponent(postText);
      const intentUrl = `https://bsky.app/intent/compose?text=${encodedText}`;
      const successMessageJSX = (
        <>Successfully created verification for {targetHandle}! <a href={intentUrl} target="_blank" rel="noopener noreferrer" className="verifier-intent-link">Post on Bluesky to let them know?</a></>
      );
      setStatusMessage(successMessageJSX);
      setTargetHandle('');
      fetchVerifications();
    } catch (error) {
      console.error('Verification failed:', error);
      setStatusMessage(`Verification failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRevoke = async (verification) => {
    if (!agent || !session) return;
    setIsRevoking(true);
    setRevokeStatusMessage(`Revoking verification for ${verification.handle}...`);
    setStatusMessage('');
    try {
      const parts = verification.uri.split('/');
      const rkey = parts[parts.length - 1];
      await agent.api.com.atproto.repo.deleteRecord({
        repo: session.did,
        collection: 'app.bsky.graph.verification',
        rkey: rkey
      });
      setRevokeStatusMessage(`Successfully revoked verification for ${verification.handle}`);
      fetchVerifications();
    } catch (error) {
      console.error('Revocation failed:', error);
      setRevokeStatusMessage(`Revocation failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRevoking(false);
    }
  };

  // Debounced function to fetch typeahead suggestions
  const fetchSuggestions = useCallback(async (query) => {
    if (!query || query.length < 1) { // Minimum query length
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setIsLoadingSuggestions(true);
    setShowSuggestions(true); // Show list when fetching starts
    try {
      const url = `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(query)}&limit=10`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      const data = await response.json();
      setSuggestions(data.actors || []);
    } catch (error) {
      console.error("Failed to fetch suggestions:", error);
      setSuggestions([]); // Clear suggestions on error
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  // Handler for input change with debouncing
  const handleInputChange = (e) => {
    const newHandle = e.target.value;
    setTargetHandle(newHandle);

    // Clear existing debounce timer
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (newHandle.trim() === '') {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoadingSuggestions(false);
      return; // Don't fetch if input is empty
    }

    // Set new debounce timer
    debounceTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(newHandle);
    }, 300); // 300ms debounce delay
  };

  // Handler for clicking a suggestion
  const handleSuggestionClick = (handle) => {
    setTargetHandle(handle);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Handler for verifying a list
  const handleVerifyList = async (e) => {
    e.preventDefault();
    if (!agent || !session || !selectedListUri) {
        setStatusMessage('Please select a list to verify.');
        return;
    }

    const selectedList = userLists.find(list => list.uri === selectedListUri);
    if (!selectedList) {
        setStatusMessage('Selected list not found.');
        return;
    }

    setIsVerifying(true);
    setBulkVerifyStatus(`Fetching members of list: ${selectedList.name}...`); // Initial status
    setBulkVerifyProgress('');
    setStatusMessage(''); // Clear single verify status
    setRevokeStatusMessage(''); // Clear revoke status

    // Initialize counters
    let successCount = 0;
    let failureCount = 0;
    let totalCount = 0;
    let errors = [];
    let skippedCount = 0; // Track skipped users

    try {
        let fetchedItems = [];
        let sourceDescription = selectedList ? `list "${selectedList.name}"` : "the selected list";
        if (selectedListUri === followsListUri) {
            sourceDescription = "follows list";
            setBulkVerifyStatus(`Fetching your follows...`);
            fetchedItems = await fetchAllPaginated(
                agent.api.app.bsky.graph,
                'getFollows',
                { actor: session.did, limit: 100 },
                false
            );
             // The items are directly in the result array for getFollows
        } else {
             // Fetch items from a regular list
            setBulkVerifyStatus(`Fetching members of list: ${selectedList.name}...`);
            fetchedItems = await fetchAllPaginated(
                agent.api.app.bsky.graph,
                'getList',
                { list: selectedListUri, limit: 100 },
                false
            );
            // For getList, the users are within the 'subject' property of each item
        }

        totalCount = fetchedItems.length;
        setBulkVerifyStatus(`Found ${totalCount} members in ${sourceDescription}. Starting verification...`);

        if (totalCount === 0) {
            setBulkVerifyStatus(`${sourceDescription} is empty. No users to verify.`);
            setIsVerifying(false);
            return;
        }

        // Iterate and verify each user
        for (let i = 0; i < fetchedItems.length; i++) {
            const item = fetchedItems[i];
            let targetUser, targetHandle, targetDid, targetDisplayName;

            // Extract user details based on source
            if (selectedListUri === followsListUri) {
                 // item is the user profile directly from getFollows result
                 targetUser = item;
                 targetDid = targetUser.did;
                 targetHandle = targetUser.handle;
                 targetDisplayName = targetUser.displayName || targetHandle;
            } else {
                 // item is from getList result, user is in item.subject
                 targetUser = item.subject;
                 targetDid = targetUser.did;
                 targetHandle = targetUser.handle;
                 targetDisplayName = targetUser.displayName || targetHandle;
            }

            // Check if essential details are present (safety check)
             if (!targetDid || !targetHandle) {
                 console.warn(`Skipping item at index ${i} due to missing DID or handle`, item);
                 failureCount++;
                 errors.push(`Item ${i + 1}: Missing DID or handle`);
                 continue;
             }

            setBulkVerifyProgress(`Verifying ${i + 1} of ${totalCount}: @${targetHandle}`);

            // Check for duplicates if skipDuplicates is enabled
            if (skipDuplicates && verifications.some(v => v.subject === targetDid)) {
                setBulkVerifyProgress(`Skipping ${i + 1} of ${totalCount}: @${targetHandle} (already verified)`);
                skippedCount++;
                continue; // Move to the next user
            }

            try {
                const verificationRecord = {
                    $type: 'app.bsky.graph.verification',
                    subject: targetDid,
                    handle: targetHandle, // Store handle at time of verification
                    displayName: targetDisplayName, // Store displayName at time of verification
                    createdAt: new Date().toISOString(),
                };

                await agent.api.com.atproto.repo.createRecord({
                    repo: session.did,
                    collection: 'app.bsky.graph.verification',
                    record: verificationRecord,
                });
                successCount++;
            } catch (error) {
                console.error(`Failed to verify @${targetHandle} (DID: ${targetDid}):`, error);
                failureCount++;
                errors.push(`@${targetHandle}: ${error.message || 'Unknown error'}`);
                // Decide if you want to stop on first error or continue
                // continue;
            }
        }

        // Final status message
        let finalMessage = `Bulk verification complete for ${sourceDescription}. \n`;
        finalMessage += `Successfully verified: ${successCount}. \n`;
        if (failureCount > 0) {
            finalMessage += `Failed: ${failureCount}. \n`;
            // Consider showing detailed errors, maybe in console or a collapsible section
            console.log("Bulk verification errors:", errors);
            finalMessage += `Check console for details on failures.`;
        }
        if (skippedCount > 0) { // Add skipped info
            finalMessage += `Skipped (already verified): ${skippedCount}.`;
        }
        setBulkVerifyStatus(finalMessage);
        fetchVerifications(); // Refresh the list of verified accounts
        setSelectedListUri(''); // Reset selection

    } catch (error) {
        console.error('Failed to fetch or process list items:', error);
        setBulkVerifyStatus(`Error during bulk verification for "${selectedList.name}": ${error.message || 'Unknown error'}`);
    } finally {
        setIsVerifying(false);
        setBulkVerifyProgress('');
    }
  };

  // Handler for revoking a list
  const handleRevokeList = async (e) => {
    e.preventDefault();
    if (!agent || !session || !selectedListUriForRevoke) {
        setBulkRevokeStatus('Please select a list to revoke.');
        return;
    }

    const selectedList = userLists.find(list => list.uri === selectedListUriForRevoke);
    if (!selectedList) {
        setBulkRevokeStatus('Selected list not found.');
        return;
    }

    // Determine source description early for use in error messages
    let sourceDescription = selectedList ? `list "${selectedList.name}"` : "the selected list";
    if (selectedListUriForRevoke === followsListUri) {
        sourceDescription = "follows list";
    }

    // Confirmation dialog
    if (!window.confirm(`Are you sure you want to revoke verifications for all users found in ${sourceDescription}? This cannot be undone.`)) {
        return;
    }

    setIsRevoking(true);
    setBulkRevokeStatus(`Fetching members of list: ${selectedList.name}...`);
    setBulkRevokeProgress('');
    setRevokeStatusMessage(''); // Clear single revoke status

    let successCount = 0;
    let failureCount = 0;
    let totalToRevoke = 0;
    let errors = [];

    try {
        let fetchedItems = [];
        let listMemberDids = new Set();
        // sourceDescription is already set above

        // Check if it's the special Follows list
        if (selectedListUriForRevoke === followsListUri) {
             // sourceDescription = "follows list"; // Already set
             setBulkRevokeStatus(`Fetching your follows...`);
             fetchedItems = await fetchAllPaginated(
                 agent.api.app.bsky.graph,
                 'getFollows',
                 { actor: session.did, limit: 100 },
                 false
             );
             // Extract DIDs directly from the follows list items
             listMemberDids = new Set(fetchedItems.map(item => item.did));
        } else {
            // Fetch items from a regular list
            setBulkRevokeStatus(`Fetching members of list: ${selectedList.name}...`);
            fetchedItems = await fetchAllPaginated(
                agent.api.app.bsky.graph,
                'getList',
                { list: selectedListUriForRevoke, limit: 100 },
                false
            );
            // Extract DIDs from the subject of list items
             listMemberDids = new Set(fetchedItems.map(item => item.subject.did));
        }

        if (fetchedItems.length === 0 && selectedListUriForRevoke !== followsListUri) {
            // Only show empty message if it wasn't the follows list (or if follows *was* empty)
            setBulkRevokeStatus(`List "${selectedList.name}" is empty. No users to check for revocation.`);
            setIsRevoking(false);
            return;
        }

        // Filter existing verifications to find those matching list members
        const verificationsToRevoke = verifications.filter(verification =>
            listMemberDids.has(verification.subject)
        );

        totalToRevoke = verificationsToRevoke.length;
        setBulkRevokeStatus(`Found ${totalToRevoke} existing verification(s) matching users in ${sourceDescription}. Starting revocation...`);

        if (totalToRevoke === 0) {
            setBulkRevokeStatus(`No existing verifications match users in the ${sourceDescription}.`);
            setIsRevoking(false);
            return;
        }

        // Iterate and revoke each matching verification
        for (let i = 0; i < verificationsToRevoke.length; i++) {
            const verification = verificationsToRevoke[i];
            const handle = verification.handle || verification.subject; // Use handle if available
            setBulkRevokeProgress(`Revoking ${i + 1} of ${totalToRevoke}: @${handle}`);

            try {
                const parts = verification.uri.split('/');
                const rkey = parts[parts.length - 1];

                await agent.api.com.atproto.repo.deleteRecord({
                    repo: session.did,
                    collection: 'app.bsky.graph.verification',
                    rkey: rkey
                });
                successCount++;
            } catch (error) {
                console.error(`Failed to revoke @${handle} (URI: ${verification.uri}):`, error);
                failureCount++;
                errors.push(`@${handle}: ${error.message || 'Unknown error'}`);
            }
        }

        // Final status message
        let finalMessage = `Bulk revocation complete for ${sourceDescription}. \n`;
        finalMessage += `Successfully revoked: ${successCount}. \n`;
        if (failureCount > 0) {
            finalMessage += `Failed: ${failureCount}. \n`;
            console.log("Bulk revocation errors:", errors);
            finalMessage += `Check console for details on failures.`;
        }
        setBulkRevokeStatus(finalMessage);
        fetchVerifications(); // Refresh the list of verified accounts
        setSelectedListUriForRevoke(''); // Reset selection

    } catch (error) {
        console.error('Failed to fetch or process items for revocation:', error);
        setBulkRevokeStatus(`Error during bulk revocation for ${sourceDescription}: ${error.message || 'Unknown error'}`);
    } finally {
        setIsRevoking(false);
        setBulkRevokeProgress('');
    }
  };

  // Handler for revoking by time range
  const handleRevokeByTime = async () => {
    if (!agent || !session || !revokeTimeRange || verifications.length === 0) {
        setBulkRevokeStatus('Cannot revoke by time: Missing agent, session, time range, or no verifications found.');
        return;
    }

    // Calculate cutoff time
    const now = new Date();
    let cutoffTime = new Date(now); // Copy current time
    switch (revokeTimeRange) {
        case '30m':
            cutoffTime.setMinutes(now.getMinutes() - 30);
            break;
        case '1h':
            cutoffTime.setHours(now.getHours() - 1);
            break;
        case '1d':
            cutoffTime.setDate(now.getDate() - 1);
            break;
        default:
            setBulkRevokeStatus('Invalid time range selected.');
            return;
    }

    // Filter verifications created after the cutoff time
    const verificationsToRevoke = verifications.filter(v => 
        new Date(v.createdAt) > cutoffTime
    );

    const count = verificationsToRevoke.length;
    if (count === 0) {
        setBulkRevokeStatus(`No verifications found created within the selected time range (${revokeTimeRange}).`);
        return;
    }

    // Confirmation dialog
    if (!window.confirm(`Are you sure you want to revoke ${count} verification(s) created in the last ${revokeTimeRange}? This cannot be undone.`)) {
        return;
    }

    setIsRevoking(true);
    setBulkRevokeStatus(`Starting revocation for ${count} record(s) created in the last ${revokeTimeRange}...`);
    setBulkRevokeProgress('');
    setRevokeStatusMessage(''); // Clear single revoke status

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    try {
        // Iterate and revoke each matching verification
        for (let i = 0; i < verificationsToRevoke.length; i++) {
            const verification = verificationsToRevoke[i];
            const handle = verification.handle || verification.subject; // Use handle if available
            setBulkRevokeProgress(`Revoking ${i + 1} of ${count}: @${handle} (Created: ${new Date(verification.createdAt).toLocaleTimeString()})`);

            try {
                const parts = verification.uri.split('/');
                const rkey = parts[parts.length - 1];

                await agent.api.com.atproto.repo.deleteRecord({
                    repo: session.did,
                    collection: 'app.bsky.graph.verification',
                    rkey: rkey
                });
                successCount++;
            } catch (error) {
                console.error(`Failed to revoke @${handle} (URI: ${verification.uri}):`, error);
                failureCount++;
                errors.push(`@${handle}: ${error.message || 'Unknown error'}`);
            }
        }

        // Final status message
        let finalMessage = `Time-based revocation complete (${revokeTimeRange}). \n`;
        finalMessage += `Successfully revoked: ${successCount}. \n`;
        if (failureCount > 0) {
            finalMessage += `Failed: ${failureCount}. \n`;
            console.log("Time-based revocation errors:", errors);
            finalMessage += `Check console for details on failures.`;
        }
        setBulkRevokeStatus(finalMessage);
        fetchVerifications(); // Refresh the list of verified accounts

    } catch (error) {
        console.error('Error during time-based revocation process:', error);
        setBulkRevokeStatus(`Error during time-based revocation (${revokeTimeRange}): ${error.message || 'Unknown error'}`);
    } finally {
        setIsRevoking(false);
        setBulkRevokeProgress('');
    }
  };

  // Handler to hide suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionListRef.current && !suggestionListRef.current.contains(event.target)) {
        // Check if the click target is the input field itself to avoid immediate closing
        if (!event.target.classList.contains('verifier-input-field')) {
            setShowSuggestions(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handler for input focus to potentially show suggestions again if needed
  const handleInputFocus = () => {
    if (targetHandle.trim() !== '' && suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  // Handler to load more verifications
  const handleLoadMoreVerifications = () => {
    if (verificationsCursor && !isLoadingMoreVerifications) {
        fetchVerifications(verificationsCursor);
    }
  };

  // Handle loading and error states
  if (isAuthLoading) return <p>Loading authentication...</p>;
  if (authError) return <p>Authentication Error: {authError}. <a href="/login">Please login</a>.</p>;
  
  const isAnyOperationInProgress = isVerifying || isRevoking || isLoadingVerifications || isLoadingNetwork || isCheckingValidity || isLoadingSuggestions;

  return (
    <div className="verifier-container">
      <div className="verifier-intro-container">
      <h1>Bluesky Verifier Tool</h1>
      <p className="verifier-intro-text">
        With Bluesky's new verification system, anyone can verify anyone else and any Bluesky client can choose which accounts to treat as "Trusted Verifiers".
      </p>
      <p className="verifier-intro-text">
        Try verifying an account for yourself or check to see who has verified you! It's as simple as creating a verification record in your PDS that points to the account you want to verify. The record looks like this: 
      </p>
      <p>
      app.bsky.graph.verification
      </p>
      </div>


      <div className="verifier-section">
        <h2>Verify a Bluesky User</h2>
        <p>Enter the handle of the user you want to verify, or select a list to verify multiple users:</p>

        {/* Mode Toggle */}
        <div className="verifier-mode-toggle">
          <label>
            <input
              type="radio"
              name="verifyMode"
              value="single"
              checked={verifyMode === 'single'}
              onChange={() => setVerifyMode('single')}
              disabled={isVerifying || isFetchingLists}
            />
            Verify Single User
          </label>
          <label>
            <input
              type="radio"
              name="verifyMode"
              value="list"
              checked={verifyMode === 'list'}
              onChange={() => setVerifyMode('list')}
              disabled={isVerifying || isFetchingLists}
            />
            Verify List
          </label>
        </div>

        {/* Verification Options */}
        <div className="verifier-options">
            <label>
                <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    disabled={isVerifying}
                />
                Prevent Duplications
            </label>
        </div>

        {/* Conditional Input Area */}
        <div className="verifier-input-wrapper">
          {verifyMode === 'single' ? (
            <form onSubmit={handleVerify} className="verifier-form-container" style={{ marginBottom: 0 }}>
              <input
                type="text"
                value={targetHandle}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                placeholder="username.bsky.social"
                disabled={isVerifying || isRevoking || isLoadingVerifications || isLoadingNetwork || isCheckingValidity || isFetchingLists}
                required
                className="verifier-input-field"
                autoComplete="off"
              />
              <button type="submit" disabled={isVerifying || !targetHandle} className="verifier-submit-button">
                {isVerifying ? 'Verifying...' : 'Verify Account'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyList} className="verifier-form-container" style={{ marginBottom: 0 }}>
              <select
                value={selectedListUri}
                onChange={(e) => setSelectedListUri(e.target.value)}
                disabled={isVerifying || isFetchingLists || userLists.length === 0}
                required
                className="verifier-list-select"
              >
                <option value="" disabled>{isFetchingLists ? "Loading lists..." : userLists.length === 0 ? "No lists found" : "-- Select a list --"}</option>
                {userLists.map(list => (
                  <option key={list.uri} value={list.uri}>
                    {list.name} ({list.listItemCount || 0} members)
                  </option>
                ))}
              </select>
              <button type="submit" disabled={isVerifying || !selectedListUri || isFetchingLists} className="verifier-submit-button">
                {isVerifying ? 'Verifying List...' : 'Verify Selected List'}
              </button>
            </form>
          )}

          {/* Suggestions only shown in single mode */}
          {verifyMode === 'single' && showSuggestions && (
            <ul className="verifier-suggestions-list" ref={suggestionListRef}>
              {isLoadingSuggestions ? (
                <li className="verifier-suggestion-item loading">Loading suggestions...</li>
              ) : suggestions.length > 0 ? (
                 suggestions.map(actor => (
                   <li key={actor.did} className="verifier-suggestion-item" onClick={() => handleSuggestionClick(actor.handle)}>
                     <img src={actor.avatar} alt="" className="verifier-suggestion-avatar" onError={(e) => e.target.style.display = 'none'} />
                     <div className="verifier-suggestion-text">
                       <span className="verifier-suggestion-name">{actor.displayName || actor.handle}</span>
                       <span className="verifier-suggestion-handle">@{actor.handle}</span>
                     </div>
                   </li>
                 ))
              ) : (
                <li className="verifier-suggestion-item none">No users found.</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Combined Status Area */} 
      {(statusMessage || bulkVerifyStatus || bulkVerifyProgress) && (
        <div className={`verifier-status-box 
          ${(statusMessage && (statusMessage.includes('failed') || statusMessage.includes('Error'))) || 
            (bulkVerifyStatus && (bulkVerifyStatus.includes('failed') || bulkVerifyStatus.includes('Error'))) 
            ? 'verifier-status-box-error' 
            : 'verifier-status-box-success'}
          ${bulkVerifyProgress ? ' verifier-status-box-progress' : ''}
        `}>
            {/* Show single status OR bulk status, prioritizing bulk status if active */}
            {bulkVerifyStatus ? <p>{bulkVerifyStatus}</p> : statusMessage ? <p>{statusMessage}</p> : null}
            {/* Show bulk progress if available */}
            {bulkVerifyProgress && <p className="verifier-bulk-progress">{bulkVerifyProgress}</p>}
        </div>
      )}

      <div className="verifier-section">
         <div style={{display: 'flex', alignItems: 'center', marginBottom: '10px'}}>
          <h2 style={{ display: 'inline-block', marginRight: '0px', marginBottom: '0', border: 'none', padding: '0' }}>Your Official Verifications</h2>
         </div>
         <p className="verifier-section-description">
            Checking if any of Bluesky's Trusted Verifiers have created a verification record for your username.
         </p>
         <div>
          {TRUSTED_VERIFIERS.map(verifierId => {
            const status = officialVerifiersStatus[verifierId] || 'idle';
            let message = '...'; let icon = '⏳'; let statusClass = 'verifier-idle-status';
            switch (status) {
              case 'checking': message = `Checking ${verifierId}...`; icon = '⏳'; statusClass = 'verifier-checking-status'; break;
              case 'verified': message = `Verified by ${verifierId}`; icon = '✅'; statusClass = 'verifier-verified-status'; break;
              case 'not_verified': message = `Not verified by ${verifierId}`; icon = '❌'; statusClass = 'verifier-not-verified-status'; break;
              case 'error': message = `Error checking ${verifierId}`; icon = '⚠️'; statusClass = 'verifier-error-status'; break;
              default: message = `Pending check for ${verifierId}`;
            }
            return (<p key={verifierId} className={`verifier-official-verifier-note ${statusClass}`}>{icon} {message}</p>);
          })}
        </div>
      </div>

      <div className="verifier-section">
        <div className="verifier-list-header">
          <h2>Verifications from Your Network</h2>
          <button onClick={checkNetworkVerifications} disabled={isAnyOperationInProgress} className="verifier-action-button verifier-check-network-button">
            {isLoadingNetwork ? 'Checking Network...' : 'Check Network'}
          </button>
        </div>
        {(isLoadingNetwork || networkStatusMessage) && (<p className="verifier-network-status">{networkStatusMessage}</p>)}
        {!isLoadingNetwork && networkChecked && (
          <div className="verifier-network-results">
            <p>{networkVerifications.mutualsVerifiedMe.length > 0 ? `${networkVerifications.mutualsVerifiedMe.length} mutual(s) have verified you:` : "None of your mutuals have verified you yet."}</p>
            {networkVerifications.mutualsVerifiedMe.length > 0 && (<ul className="verifier-verifier-list">{networkVerifications.mutualsVerifiedMe.map(account => (<li key={account.did}>{account.displayName} (@{account.handle})</li>))}</ul>)}
            <p style={{marginTop: '15px'}}>{networkVerifications.followsVerifiedMe.length > 0 ? `${networkVerifications.followsVerifiedMe.length} account(s) you follow have verified you:` : "None of the accounts you follow have verified you yet."}</p>
            {networkVerifications.followsVerifiedMe.length > 0 && (<ul className="verifier-verifier-list">{networkVerifications.followsVerifiedMe.map(account => (<li key={account.did}>{account.displayName} (@{account.handle})</li>))}</ul>)}
            <div className="verifier-additional-context">
                 <p>{networkVerifications.mutualsVerifiedAnyone} of your {networkVerifications.fetchedMutualsCount} fetched mutuals have verified others.</p>
                 <p>{networkVerifications.followsVerifiedAnyone} of the {networkVerifications.fetchedFollowsCount} accounts you follow have verified others.</p>
            </div>
            {(() => {
              // Helper for pluralization
              const pluralize = (count, singular, plural) => count === 1 ? singular : plural;
              const mutualsVerifiedMeCount = networkVerifications.mutualsVerifiedMe.length;
              const followsVerifiedMeCount = networkVerifications.followsVerifiedMe.length;
              const mutualsVerifiedAnyoneCount = networkVerifications.mutualsVerifiedAnyone;
              const followsVerifiedAnyoneCount = networkVerifications.followsVerifiedAnyone;
              const fetchedMutualsCount = networkVerifications.fetchedMutualsCount;
              const fetchedFollowsCount = networkVerifications.fetchedFollowsCount;

              const statsText = `My verification stats:

${mutualsVerifiedMeCount} ${pluralize(mutualsVerifiedMeCount, 'mutual', 'mutuals')} verified me,
${followsVerifiedMeCount} ${pluralize(followsVerifiedMeCount, 'follow', 'follows')} verified me,
${mutualsVerifiedAnyoneCount}/${fetchedMutualsCount} ${pluralize(fetchedMutualsCount, 'mutual', 'mutuals')} verified others,
${followsVerifiedAnyoneCount}/${fetchedFollowsCount} ${pluralize(fetchedFollowsCount, 'follow', 'follows')} verified others,

Check yours: https://cred.blue/verifier`;
              const encodedStatsText = encodeURIComponent(statsText);
              const statsIntentUrl = `https://bsky.app/intent/compose?text=${encodedStatsText}`;
              return (<a href={statsIntentUrl} target="_blank" rel="noopener noreferrer" className="verifier-share-stats-link">Share your stats!</a>);
            })()}
          </div>
        )}
      </div>

      <div className="verifier-section">
        <div className="verifier-list-header">
          <h2>Accounts You've Verified</h2>
        </div>

        {/* Revoke Mode Toggle */}
        <div className="verifier-mode-toggle">
          <label>
            <input
              type="radio"
              name="revokeMode"
              value="single"
              checked={revokeMode === 'single'}
              onChange={() => setRevokeMode('single')}
              disabled={isRevoking || isFetchingLists}
            />
            Manage Individual
          </label>
          <label>
            <input
              type="radio"
              name="revokeMode"
              value="list"
              checked={revokeMode === 'list'}
              onChange={() => setRevokeMode('list')}
              disabled={isRevoking || isFetchingLists}
            />
            Revoke by List
          </label>
          <label>
             <input
               type="radio"
               name="revokeMode"
               value="time"
               checked={revokeMode === 'time'}
               onChange={() => setRevokeMode('time')}
               disabled={isRevoking || isFetchingLists}
             />
             Revoke by Time
          </label>
        </div>

        {/* Combined Status Area for Revocation */} 
        {(revokeStatusMessage || bulkRevokeStatus || bulkRevokeProgress) && (
          <div className={`verifier-status-box 
            ${(revokeStatusMessage && revokeStatusMessage.includes('failed')) || 
              (bulkRevokeStatus && (bulkRevokeStatus.includes('failed') || bulkRevokeStatus.includes('Error'))) 
              ? 'verifier-status-box-error' 
              : 'verifier-status-box-success'}
            ${bulkRevokeProgress ? ' verifier-status-box-progress' : ''}
          `}>
              {/* Show single status OR bulk status, prioritizing bulk status if active */}
              {bulkRevokeStatus ? <p>{bulkRevokeStatus}</p> : revokeStatusMessage ? <p>{revokeStatusMessage}</p> : null}
              {/* Show bulk progress if available */}
              {bulkRevokeProgress && <p className="verifier-bulk-progress">{bulkRevokeProgress}</p>}
          </div>
        )}

        {/* Conditional Revoke Area */}
        {revokeMode === 'single' ? (
            <> {/* Use Fragment to avoid unnecessary divs */} 
             {/* Search Input */} 
             <div className="verifier-search-input-wrapper">
                <input 
                    type="text"
                    placeholder="Search verified accounts..."
                    value={verificationSearchTerm}
                    onChange={(e) => setVerificationSearchTerm(e.target.value)}
                    className="verifier-input-field"
                    disabled={isLoadingVerifications || isRevoking}
                />
             </div>

             {/* Use the new VerificationList component */} 
             <VerificationList 
                verifications={verifications}
                isLoading={isLoadingVerifications}
                isCheckingValidity={isCheckingValidity}
                isRevoking={isRevoking}
                revokeStatusMessage={revokeStatusMessage} // Pass single revoke message
                handleRevoke={handleRevoke}
                searchTerm={verificationSearchTerm}
                // Pass pagination props
                isLoadingMore={isLoadingMoreVerifications}
                cursor={verificationsCursor}
                onLoadMore={handleLoadMoreVerifications} 
             />
            </>
        ) : revokeMode === 'list' ? (
             <div className="verifier-input-wrapper"> {/* Reuse wrapper for consistent spacing */} 
                 <form onSubmit={handleRevokeList} className="verifier-form-container" style={{ marginBottom: 0 }}>
                     <select
                         value={selectedListUriForRevoke}
                         onChange={(e) => setSelectedListUriForRevoke(e.target.value)}
                         disabled={isRevoking || isFetchingLists || userLists.length === 0}
                         required
                         className="verifier-list-select" 
                     >
                         <option value="" disabled>{isFetchingLists ? "Loading lists..." : userLists.length === 0 ? "No lists found" : "-- Select list to revoke --"}</option>
                         {userLists.map(list => (
                         <option key={list.uri} value={list.uri}>
                             {list.name} ({list.listItemCount || 0} members)
                         </option>
                         ))}
                     </select>
                     <button type="submit" disabled={isRevoking || !selectedListUriForRevoke || isFetchingLists} className="verifier-revoke-button"> {/* Reuse revoke button style */} 
                         {isRevoking ? 'Revoking List...' : 'Revoke Selected List'}
                     </button>
                 </form>
             </div>
        ) : ( /* revokeMode === 'time' */
             <div className="verifier-time-revoke-wrapper">
                <p>Select the time range to revoke verifications created within:</p>
                 <div className="verifier-time-range-selector">
                     <label>
                         <input type="radio" name="revokeTimeRange" value="30m" checked={revokeTimeRange === '30m'} onChange={(e) => setRevokeTimeRange(e.target.value)} disabled={isRevoking} />
                         Last 30 Minutes
                     </label>
                     <label>
                         <input type="radio" name="revokeTimeRange" value="1h" checked={revokeTimeRange === '1h'} onChange={(e) => setRevokeTimeRange(e.target.value)} disabled={isRevoking} />
                         Last Hour
                     </label>
                     <label>
                         <input type="radio" name="revokeTimeRange" value="1d" checked={revokeTimeRange === '1d'} onChange={(e) => setRevokeTimeRange(e.target.value)} disabled={isRevoking} />
                         Last 24 Hours
                     </label>
                 </div>
                 <button 
                    onClick={handleRevokeByTime} // Need to create this handler
                    disabled={isRevoking || !revokeTimeRange}
                    className="verifier-revoke-button"
                 >
                    {isRevoking ? 'Revoking by Time...' : 'Revoke Selected Range'}
                 </button>
            </div>
        )}
      </div>
    </div>
  );
}

// Helper component to render the verification list (incorporating search/filter)
function VerificationList({ 
    verifications, 
    isLoading, 
    isCheckingValidity, 
    isRevoking, 
    revokeStatusMessage,
    handleRevoke,
    searchTerm,
    isLoadingMore,
    cursor,
    onLoadMore,
}) {
    const filteredVerifications = useMemo(() => {
        if (!searchTerm) {
            return verifications;
        }
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return verifications.filter(v => 
            v.handle?.toLowerCase().includes(lowerCaseSearchTerm) || 
            v.displayName?.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [verifications, searchTerm]);

    if (isLoading) return <p>Loading...</p>;
    if (verifications.length === 0) return <p>You haven't verified any accounts.</p>;
    if (filteredVerifications.length === 0 && searchTerm) return <p>No verified accounts match "{searchTerm}".</p>;

    return (
        <>
            <ul className="verifier-list">
                {filteredVerifications.map((verification) => (
                <li key={verification.uri} className={`verifier-list-item ${verification.validityChecked && !verification.isValid ? 'verifier-list-item-invalid' : ''}`}>
                    <div className="verifier-list-item-content">
                        <a href={`https://bsky.app/profile/${verification.handle}`} target="_blank" rel="noopener noreferrer" className="verifier-profile-link">
                            <span className="verifier-display-name">{verification.displayName}</span>
                            <span className="verifier-list-item-handle">@{verification.handle}</span>
                        </a>
                        {verification.validityChecked && (
                            <span className={`verifier-validity-status ${verification.isValid ? 'valid' : 'invalid'}`}>
                            {verification.isValid ? '✅ Valid' : '❌ Changed'}
                            </span>
                        )}
                        {!verification.validityChecked && isCheckingValidity && (
                            <span className="verifier-validity-status checking">⏳ Checking...</span>
                        )}
                        <div className="verifier-list-item-date">Verified: {new Date(verification.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="verifier-list-item-actions">
                        <button onClick={() => handleRevoke(verification)} disabled={isRevoking || isLoading} className="verifier-revoke-button">
                            {(isRevoking && revokeStatusMessage?.includes(verification.handle)) ? 'Revoking...' : 'Revoke'} 
                        </button>
                    </div>
                </li>
                ))}
            </ul>
            {cursor && (
                <div className="verifier-load-more-container">
                    <button 
                        onClick={onLoadMore}
                        disabled={isLoadingMore}
                        className="verifier-action-button"
                    >
                        {isLoadingMore ? 'Loading...' : 'Load More'}
                    </button>
                </div>
            )}
        </>
    );
}

export default Verifier; 