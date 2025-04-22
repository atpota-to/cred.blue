import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// Helper function to fetch all paginated results using a specific agent instance
async function fetchAllPaginated(agentInstance, apiMethod, initialParams) {
  let results = [];
  let cursor = initialParams.cursor;
  const params = { ...initialParams };
  let operationName = apiMethod.name.replace('bound ', '');

  do {
    try {
      if (cursor) {
        params.cursor = cursor;
      }
      const response = await apiMethod(params);
      const listKey = Object.keys(response.data || response).find(key => Array.isArray((response.data || response)[key]));
      if (listKey && (response.data || response)[listKey]) {
          results = results.concat((response.data || response)[listKey]);
      }
      cursor = (response.data || response).cursor;
    } catch (error) {
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

// --- Debounce Hook ---
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
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
  const [officialVerifiersStatus, setOfficialVerifiersStatus] = useState({});

  // --- Autocomplete State ---
  const [suggestions, setSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debouncedSearchTerm = useDebounce(targetHandle, 300);
  const suggestionsRef = useRef(null);
  const inputRef = useRef(null);
  // --- End Autocomplete State ---

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
    setIsCheckingValidity(true);
    const updatedVerifications = [...verificationsList];
    try {
      const batchSize = 5;
      for (let i = 0; i < updatedVerifications.length; i += batchSize) {
        const batch = updatedVerifications.slice(i, i + batchSize);
        await Promise.all(batch.map(async (verification, index) => {
          try {
            const profileRes = await agent.api.app.bsky.actor.getProfile({ actor: verification.handle });
            const currentHandle = profileRes.data.handle;
            const currentDisplayName = profileRes.data.displayName || profileRes.data.handle;
            const batchIndex = i + index;
            updatedVerifications[batchIndex].validityChecked = true;
            updatedVerifications[batchIndex].isValid =
              currentHandle === verification.handle &&
              currentDisplayName === verification.displayName;
            if (!updatedVerifications[batchIndex].isValid) {
              updatedVerifications[batchIndex].currentHandle = currentHandle;
              updatedVerifications[batchIndex].currentDisplayName = currentDisplayName;
            }
            setVerifications([...updatedVerifications]);
          } catch (err) {
            console.error(`Failed to check validity for ${verification.handle}:`, err);
            const batchIndex = i + index;
            updatedVerifications[batchIndex].validityChecked = true;
            updatedVerifications[batchIndex].isValid = false;
            updatedVerifications[batchIndex].validityError = true;
            setVerifications([...updatedVerifications]);
          }
        }));
      }
      console.log('Verified all records validity:', updatedVerifications);
    } catch (error) {
      console.error('Failed to check verifications validity:', error);
    } finally {
      setIsCheckingValidity(false);
    }
  }, [agent]);

  const checkNetworkVerifications = useCallback(async () => {
    if (!agent || !session || !userInfo) return;
    setIsLoadingNetwork(true);
    setNetworkChecked(false);
    setNetworkVerifications({ mutualsVerifiedMe: [], followsVerifiedMe: [], mutualsVerifiedAnyone: 0, followsVerifiedAnyone: 0, fetchedMutualsCount: 0, fetchedFollowsCount: 0 });
    setNetworkStatusMessage("Fetching network lists (mutuals, follows)...");

    const publicAgent = new Agent({ service: 'https://public.api.bsky.app' });

    try {
      const [follows, mutuals] = await Promise.all([
        fetchAllPaginated(publicAgent, publicAgent.api.app.bsky.graph.getFollows.bind(publicAgent.api.app.bsky.graph), { actor: session.did, limit: 100 }),
        fetchAllPaginated(agent, agent.api.app.bsky.graph.getKnownFollowers.bind(agent.api.app.bsky.graph), { actor: session.did, limit: 100 })
      ]);

      console.log(`Fetched ${follows.length} follows, ${mutuals.length} mutuals.`);
      setNetworkStatusMessage(`Fetched ${follows.length} follows, ${mutuals.length} mutuals. Checking verifications...`);
      setNetworkVerifications(prev => ({ ...prev, fetchedMutualsCount: mutuals.length, fetchedFollowsCount: follows.length }));

      const followsSet = new Set(follows.map(f => f.did));
      const mutualsSet = new Set(mutuals.map(m => m.did));
      const allProfilesMap = new Map();
      [...follows, ...mutuals].forEach(user => { if (!allProfilesMap.has(user.did)) allProfilesMap.set(user.did, user); });
      const uniqueUserDids = Array.from(allProfilesMap.keys());

      if (uniqueUserDids.length === 0) {
        setNetworkStatusMessage("No mutuals or follows found.");
        setIsLoadingNetwork(false);
        setNetworkChecked(true);
        return;
      }

      let results = { mutualsVerifiedMe: [], followsVerifiedMe: [], mutualsVerifiedAnyone: 0, followsVerifiedAnyone: 0 };
      const batchSize = 10;
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
             console.warn(`Skipping verification check for ${profile?.handle || did} (no PDS found).`);
             return;
          }

          let foundVerificationForMe = null;
          let hasVerifiedAnyone = false;
          let listRecordsCursor = undefined;
          const tempPublicAgent = new Agent({ service: pdsEndpoint });

          do {
            try {
              const response = await tempPublicAgent.api.com.atproto.repo.listRecords({
                 repo: did,
                 collection: 'app.bsky.graph.verification',
                 limit: 100,
                 cursor: listRecordsCursor
              });
              const records = response.data.records || [];
              if (records.length > 0) {
                hasVerifiedAnyone = true;
                const matchingRecord = records.find(record => record.value?.subject === session.did);
                if (matchingRecord) { foundVerificationForMe = matchingRecord; break; }
              }
              listRecordsCursor = response.data.cursor;
            } catch (err) {
              console.warn(`Could not listRecords for ${did} on ${pdsEndpoint}:`, err.message);
              listRecordsCursor = undefined;
              break;
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
        setNetworkVerifications(prev => ({ ...prev, ...results }));
      }
      setNetworkStatusMessage("Network verification check complete.");
    } catch (error) {
      console.error('Error during network verification check:', error);
      setStatusMessage(`Error checking network: ${error.message || 'Unknown error'}`);
      setNetworkStatusMessage("");
    } finally {
      setIsLoadingNetwork(false);
      setNetworkChecked(true);
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
    const publicAgent = new Agent({ service: 'https://public.api.bsky.app' });

    await Promise.all(TRUSTED_VERIFIERS.map(async (verifierIdentifier) => {
      let verifierDid = null;
      let verifierHandle = verifierIdentifier;
      let currentStatus = 'checking';
      try {
        if (!verifierIdentifier.startsWith('did:')) {
          const resolveResult = await publicAgent.api.com.atproto.identity.resolveHandle({ handle: verifierIdentifier });
          verifierDid = resolveResult.data.did;
        } else {
          verifierDid = verifierIdentifier;
          try {
            const profileRes = await publicAgent.api.app.bsky.actor.getProfile({ actor: verifierDid });
            verifierHandle = profileRes.data.handle;
          } catch { /* ignore */ }
        }
        if (!verifierDid) throw new Error('Could not resolve identifier');
        const pdsEndpoint = await getPdsEndpoint(verifierDid);
        if (!pdsEndpoint) throw new Error('Could not find PDS');

        let listRecordsCursor = undefined;
        let foundMatch = false;
        const tempPublicAgent = new Agent({ service: pdsEndpoint });

        do {
          try {
            const response = await tempPublicAgent.api.com.atproto.repo.listRecords({
               repo: verifierDid,
               collection: 'app.bsky.graph.verification',
               limit: 100,
               cursor: listRecordsCursor
            });
            const records = response.data.records || [];
            const matchingRecord = records.find(record => record.value?.subject === session.did);
            if (matchingRecord) {
              currentStatus = 'verified';
              foundMatch = true;
              break;
            }
            listRecordsCursor = response.data.cursor;
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

  const fetchSuggestions = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setIsFetchingSuggestions(true);
    try {
      const publicAgent = new Agent({ service: 'https://public.api.bsky.app' });
      const response = await publicAgent.api.app.bsky.actor.searchActorsTypeahead({
         q: query,
         limit: 5
      });
      setSuggestions(response.data.actors || []);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (debouncedSearchTerm && showSuggestions) {
      fetchSuggestions(debouncedSearchTerm);
    } else if (!debouncedSearchTerm) {
      setSuggestions([]);
    }
  }, [debouncedSearchTerm, fetchSuggestions, showSuggestions]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target) &&
          inputRef.current && !inputRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [suggestionsRef, inputRef]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!agent || !session) return;
    if (!targetHandle) return;
    setIsVerifying(true);
    setStatusMessage(`Verifying ${targetHandle}...`);
    setShowSuggestions(false);
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
      const postText = `I just verified @${targetHandle} using Bluesky's new decentralized verification system. Try verifying someone yourself using @cred.blue's new verification tool: https://cred.blue/verify`;
      const encodedText = encodeURIComponent(postText);
      const intentUrl = `https://bsky.app/intent/compose?text=${encodedText}`;
      const successMessageJSX = (
        <>Successfully created verification for {targetHandle}! <a href={intentUrl} target="_blank" rel="noopener noreferrer" className="verifier-intent-link">Post on Bluesky?</a></>
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
    setStatusMessage(`Revoking verification for ${verification.handle}...`);
    try {
      const parts = verification.uri.split('/');
      const rkey = parts[parts.length - 1];
      await agent.api.com.atproto.repo.deleteRecord({
        repo: session.did,
        collection: 'app.bsky.graph.verification',
        rkey: rkey
      });
      setStatusMessage(`Successfully revoked verification for ${verification.handle}`);
      fetchVerifications();
    } catch (error) {
      console.error('Revocation failed:', error);
      setStatusMessage(`Revocation failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRevoking(false);
    }
  };

  const handleSuggestionClick = (handle) => {
    setTargetHandle(handle);
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  if (isAuthLoading) return <p>Loading authentication...</p>;
  if (authError) return <p>Authentication Error: {authError}. <a href="/login">Please login</a>.</p>;
  if (!session && !isAuthLoading && !authError) {
     return (<div className="verifier-container"><h1>Bluesky Verifier Tool</h1><p>Please <a href="/login">login with Bluesky</a> to use the verifier tool.</p></div>);
  }

  const isAnyOperationInProgress = isVerifying || isRevoking || isLoadingVerifications || isLoadingNetwork || isCheckingValidity;
  const trustedVerifiersTooltip = `Checking if any of these Trusted Verifiers have created a verification record for your DID: ${TRUSTED_VERIFIERS.join(', ')}.`;

  return (
    <div className="verifier-container">
      <h1>Bluesky Verifier Tool</h1>
      <p className="verifier-intro-text">
        With Bluesky's new decentralized verification system, anyone can verify anyone else and any Bluesky client can choose which accounts to treat as "Trusted Verifiers". It's a first-of-its-kind verification system for a mainstream social platform of this size. Try verifying an account for yourself or check to see who has verified you!
      </p>
      <div className="verifier-page-header">
        <p className="verifier-user-info">Logged in as: {userInfo ? `${userInfo.displayName} (@${userInfo.handle})` : session?.did}</p>
        <button onClick={signOut} disabled={isAnyOperationInProgress} className="verifier-sign-out-button">Sign Out</button>
      </div>
      <hr />

      <div className="verifier-section">
        <h2>Verify a Bluesky User</h2>
        <p>Enter the handle of the user you want to verify (e.g., targetuser.bsky.social):</p>
        <div className="verifier-input-container">
          <form onSubmit={handleVerify} className="verifier-form-container" style={{ marginBottom: 0 }}>
            <input
              ref={inputRef}
              type="text"
              value={targetHandle}
              onChange={(e) => {
                const newValue = e.target.value;
                setTargetHandle(newValue);
                setShowSuggestions(newValue.length >= 2);
                if(newValue.length < 2) setSuggestions([]);
              }}
              onFocus={() => { if (targetHandle.length >= 2) setShowSuggestions(true); }}
              placeholder="targetuser.bsky.social"
              disabled={isAnyOperationInProgress}
              required
              className="verifier-input-field"
              autoComplete="off"
            />
            <button type="submit" disabled={isVerifying || !targetHandle} className="verifier-submit-button">
              {isVerifying ? 'Verifying...' : 'Create Verification Record'}
            </button>
          </form>
          {showSuggestions && (suggestions.length > 0 || isFetchingSuggestions) && (
            <ul className="verifier-suggestions-list" ref={suggestionsRef}>
              {isFetchingSuggestions && suggestions.length === 0 ? (
                 <li className="verifier-suggestion-item">Loading...</li>
              ) : (
                suggestions.map((actor) => (
                  <li key={actor.did} className="verifier-suggestion-item" onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(actor.handle); }}>
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

      {statusMessage && (
        <div className={`verifier-status-box ${typeof statusMessage === 'string' && (statusMessage.includes('failed') || statusMessage.includes('Error')) ? 'verifier-status-box-error' : 'verifier-status-box-success'}`}>
          <p>{statusMessage}</p>
        </div>
      )}

      <div className="verifier-section">
         <div style={{display: 'flex', alignItems: 'center', marginBottom: '10px'}}>
          <h2 style={{ display: 'inline-block', marginRight: '8px', marginBottom: 0, border: 'none', padding: 0 }}>Your Verification Status</h2>
          <span title={trustedVerifiersTooltip} className="verifier-official-verifier-tooltip" style={{ fontSize: '1.2em' }}>(?)</span>
        </div>
        <div>
          {TRUSTED_VERIFIERS.map(verifierId => {
            const status = officialVerifiersStatus[verifierId] || 'idle';
            let message = '...'; let icon = '⏳'; let statusClass = 'verifier-idle-status';
            switch (status) {
              case 'checking': message = `Checking ${verifierId}...`; icon = '⏳'; statusClass = 'verifier-checking-status'; break;
              case 'verified': message = `Verified by ${verifierId}.`; icon = '✅'; statusClass = 'verifier-verified-status'; break;
              case 'not_verified': message = `Not verified by ${verifierId}.`; icon = '❌'; statusClass = 'verifier-not-verified-status'; break;
              case 'error': message = `Error checking ${verifierId}.`; icon = '⚠️'; statusClass = 'verifier-error-status'; break;
              default: message = `Pending check for ${verifierId}.`;
            }
            return (<p key={verifierId} className={`verifier-official-verifier-note ${statusClass}`}>{icon} {message}</p>);
          })}
        </div>
      </div>

      <div className="verifier-section">
        <div className="verifier-list-header">
          <h2>Who's Verified You?</h2>
          <button onClick={checkNetworkVerifications} disabled={isAnyOperationInProgress} className="verifier-action-button verifier-check-network-button">
            {isLoadingNetwork ? 'Checking Network...' : 'Check Network Now'}
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
              const statsText = `My verification stats:

${networkVerifications.mutualsVerifiedMe.length} mutuals verified me
${networkVerifications.followsVerifiedMe.length} follows verified me
${networkVerifications.mutualsVerifiedAnyone}/${networkVerifications.fetchedMutualsCount} mutuals verified others
${networkVerifications.followsVerifiedAnyone}/${networkVerifications.fetchedFollowsCount} follows verified others

Check yours: https://cred.blue/verify`;
              const encodedStatsText = encodeURIComponent(statsText);
              const statsIntentUrl = `https://bsky.app/intent/compose?text=${encodedStatsText}`;
              return (<a href={statsIntentUrl} target="_blank" rel="noopener noreferrer" className="verifier-share-stats-link">Share your stats!</a>);
            })()}
          </div>
        )}
        {!isLoadingNetwork && !networkChecked && (<p>Click "Check Network Now" to see verifications from your network.</p>)}
      </div>

      <div className="verifier-section">
        <div className="verifier-list-header">
          <h2>Accounts You've Verified</h2>
          <button onClick={fetchVerifications} disabled={isAnyOperationInProgress} className="verifier-action-button verifier-refresh-button">Refresh List</button>
        </div>
        {isLoadingVerifications ? (<p>Loading...</p>) : verifications.length === 0 ? (<p>You haven't verified any accounts.</p>) : (
          <ul className="verifier-list">
            {verifications.map((verification) => (
              <li key={verification.uri} className={`verifier-list-item ${verification.validityChecked && !verification.isValid ? 'verifier-list-item-invalid' : ''}`}>
                <div className="verifier-list-item-content">
                  <div style={{ fontWeight: 'bold' }}>{verification.displayName}</div>
                  <div className="verifier-list-item-handle">@{verification.handle}</div>
                  <div className="verifier-list-item-date">Verified: {new Date(verification.createdAt).toLocaleString()}</div>
                  {verification.validityChecked && !verification.isValid && (
                    <div className="verifier-validity-warning">
                      {verification.validityError ? (<p>⚠️ Couldn't check profile</p>) : (<><p><strong>⚠️ Profile changed</strong></p><p><span>Now: @{verification.currentHandle}</span><br /><span>Name: {verification.currentDisplayName}</span></p></>)}
                    </div>
                  )}
                </div>
                <div className="verifier-list-item-actions">
                  <button onClick={() => handleRevoke(verification)} disabled={isRevoking || isLoadingVerifications} className="verifier-revoke-button">
                    {isRevoking ? 'Revoking...' : 'Revoke'}
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