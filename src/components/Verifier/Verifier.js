import React, { useState, useEffect, useCallback } from 'react';
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
async function fetchAllPaginated(agentInstance, apiMethod, initialParams, useDirectFetch = false, directUrl = null) {
  let results = [];
  let cursor = initialParams.cursor;
  const params = { ...initialParams }; // Copy initial params
  // Determine operation name
  const operationName = apiMethod ? (apiMethod.name.includes('bound ') ? apiMethod.name.split('bound ')[1].trim() : apiMethod.name) : (directUrl || 'directFetch');
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
      } else if (apiMethod) {
        // Use agent method
        if (cursor) {
          params.cursor = cursor;
        }
        const response = await apiMethod(params);
        if (!response || !response.data) {
            console.warn(`fetchAllPaginated: Invalid agent response for ${operationName}`, response);
            break;
        }
        responseData = response.data;
      } else {
         console.error("fetchAllPaginated: Called without agent method or direct URL");
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

  const fetchVerifications = useCallback(async () => {
    if (!agent || !session) return;
    setIsLoadingVerifications(true);
    try {
      const response = await agent.api.com.atproto.repo.listRecords({
        repo: session.did,
        collection: 'app.bsky.graph.verification',
        limit: 100,
      });
      console.log('Fetched verifications:', response.data);
      if (response.data.records) {
        const formatted = response.data.records.map(record => ({
          uri: record.uri,
          cid: record.cid,
          handle: record.value.handle,
          displayName: record.value.displayName,
          subject: record.value.subject,
          createdAt: record.value.createdAt,
          isValid: true,
          validityChecked: false
        }));
        setVerifications(formatted);
        checkVerificationsValidity(formatted);
      } else {
        setVerifications([]);
      }
    } catch (error) {
      console.error('Failed to fetch verifications:', error);
      setStatusMessage(`Failed to load verifications: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoadingVerifications(false);
    }
  }, [agent, session]);

  const checkVerificationsValidity = useCallback(async (verificationsList) => {
    if (!agent || verificationsList.length === 0) return;
    if (verificationsList.length === 0) return;

    setIsCheckingValidity(true);
    const updatedVerifications = [...verificationsList];
    try {
      const batchSize = 5;
      for (let i = 0; i < updatedVerifications.length; i += batchSize) {
        const batch = updatedVerifications.slice(i, i + batchSize);
        await Promise.all(batch.map(async (verification, index) => {
          const batchIndex = i + index;
          try {
            // *** Get the specific PDS for the verified user ***
            const targetDid = verification.subject;
            const pdsEndpoint = await getPdsEndpoint(targetDid);

            if (!pdsEndpoint) {
              throw new Error(`Could not find PDS for ${verification.handle || targetDid}`);
            }

            // *** Use direct fetch to get the profile from the correct PDS ***
            const profileUrl = `${pdsEndpoint}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(targetDid)}`;
            const profileResponse = await fetch(profileUrl);

            if (!profileResponse.ok) {
                // If profile fetch fails (e.g., 404), mark validity check failed
                throw new Error(`Failed to fetch profile from ${pdsEndpoint}: ${profileResponse.status}`);
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
        // Update state after each batch completes
        setVerifications([...updatedVerifications]);
      }
      console.log('Verified all records validity:', updatedVerifications);
    } catch (error) {
      console.error('Error during batch processing for validity check:', error);
    } finally {
      setIsCheckingValidity(false);
    }
  }, []); // Removed agent dependency as it's no longer used directly here

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

  useEffect(() => {
    if (agent) {
      fetchVerifications();
    }
  }, [agent, fetchVerifications]);

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

  // Handle loading and error states
  if (isAuthLoading) return <p>Loading authentication...</p>;
  if (authError) return <p>Authentication Error: {authError}. <a href="/login">Please login</a>.</p>;
  
  const isAnyOperationInProgress = isVerifying || isRevoking || isLoadingVerifications || isLoadingNetwork || isCheckingValidity;

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
        <p>Enter the handle of the user you want to verify:</p>
          <form onSubmit={handleVerify} className="verifier-form-container" style={{ marginBottom: 0 }}>
            <input
              type="text"
              value={targetHandle}
              onChange={(e) => setTargetHandle(e.target.value)}
              placeholder="username.bsky.social"
              disabled={isAnyOperationInProgress}
              required
              className="verifier-input-field"
              autoComplete="off"
            />
            <button type="submit" disabled={isVerifying || !targetHandle} className="verifier-submit-button">
              {isVerifying ? 'Verifying...' : 'Verify Account'}
            </button>
          </form>
      </div>

      {statusMessage && (
        <div className={`verifier-status-box ${typeof statusMessage === 'string' && (statusMessage.includes('failed') || statusMessage.includes('Error')) ? 'verifier-status-box-error' : 'verifier-status-box-success'}`}>
          <p>{statusMessage}</p>
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

        {revokeStatusMessage && (
          <div className={`verifier-status-box ${revokeStatusMessage.includes('failed') ? 'verifier-status-box-error' : 'verifier-status-box-success'}`}>
             <p>{revokeStatusMessage}</p>
          </div>
        )}

        {isLoadingVerifications ? (<p>Loading...</p>) : verifications.length === 0 ? (<p>You haven't verified any accounts.</p>) : (
          <ul className="verifier-list">
            {verifications.map((verification) => (
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
                  <button onClick={() => handleRevoke(verification)} disabled={isRevoking || isLoadingVerifications} className="verifier-revoke-button">
                    {(isRevoking && revokeStatusMessage.includes(verification.handle)) ? 'Revoking...' : 'Revoke'}
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