import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import WrappedPublic from './WrappedPublic';
import WrappedAuthenticated from './WrappedAuthenticated';
import { 
  getRepoData, 
  resolveHandleToDid, 
  getServiceEndpointForDid 
} from '../../utils/carParser';
import { analyzeWrappedData } from '../../utils/wrappedAnalyzer';
import './Wrapped.css';

const Wrapped = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { session, isAuthenticated } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [repoData, setRepoData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [targetDid, setTargetDid] = useState(null);
  const [targetHandle, setTargetHandle] = useState(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    loadWrappedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, session]);

  const loadWrappedData = async () => {
    setLoading(true);
    setError(null);
    setRepoData(null);
    setAnalysis(null);

    try {
      let did;
      let handle;

      // Determine which profile to load
      if (username) {
        // Loading someone else's profile or a specific username
        handle = username;
        
        // Check if it's a DID or handle
        if (username.startsWith('did:')) {
          did = username;
          // We'll need to fetch the handle from the profile
        } else {
          try {
            did = await resolveHandleToDid(username);
          } catch (resolveError) {
            throw new Error(`Could not find user "${username}". Please check the handle and try again.`);
          }
        }
      } else if (isAuthenticated && session) {
        // No username provided, load authenticated user's own profile
        did = session.did;
        // Get handle from session if available
        handle = session.handle || did;
      } else {
        // Not authenticated and no username - redirect to login
        navigate('/login?returnUrl=/wrapped');
        return;
      }

      setTargetDid(did);
      setTargetHandle(handle);

      // Check if this is the user's own profile
      const ownProfile = isAuthenticated && session && session.did === did;
      setIsOwnProfile(ownProfile);

      // Get the service endpoint
      let serviceEndpoint;
      try {
        serviceEndpoint = await getServiceEndpointForDid(did);
      } catch (endpointError) {
        throw new Error('Could not find the user\'s data server. The account may not exist or be inaccessible.');
      }

      // Fetch and parse the repo
      let data;
      try {
        data = await getRepoData(did, serviceEndpoint);
      } catch (repoError) {
        if (repoError.message && repoError.message.includes('403')) {
          throw new Error('This account\'s data is private or restricted.');
        } else if (repoError.message && repoError.message.includes('404')) {
          throw new Error('This account does not exist or has no data.');
        } else if (repoError.message && repoError.message.includes('timeout')) {
          throw new Error('Request timed out. The account may be too large. Please try again later.');
        } else {
          throw new Error('Failed to fetch account data. Please try again later.');
        }
      }

      // Validate that we got data
      if (!data || !data.records) {
        throw new Error('No data found for this account.');
      }

      setRepoData(data);

      // Analyze the data
      try {
        const wrappedAnalysis = analyzeWrappedData(data.records, did);
        setAnalysis(wrappedAnalysis);
      } catch (analysisError) {
        console.error('Error analyzing data:', analysisError);
        throw new Error('Failed to analyze account data. The data may be incomplete or corrupted.');
      }

    } catch (err) {
      console.error('Error loading wrapped data:', err);
      setError(err.message || 'Failed to load wrapped data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="wrapped-page">
        <div className="wrapped-loading">
          <div className="loading-spinner-large"></div>
          <p>Loading your Bluesky Wrapped...</p>
          <p className="loading-subtext">This may take a moment for large accounts</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wrapped-page">
        <div className="wrapped-error">
          <h2>Oops! Something went wrong</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/home')} className="btn-home">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Decide which view to render
  if (isOwnProfile && isAuthenticated) {
    // Show full authenticated view
    return (
      <WrappedAuthenticated 
        analysis={analysis}
        repoData={repoData}
        did={targetDid}
        handle={targetHandle}
      />
    );
  } else {
    // Show public view with sign-in prompt
    return (
      <WrappedPublic 
        analysis={analysis}
        repoData={repoData}
        did={targetDid}
        handle={targetHandle}
        isAuthenticated={isAuthenticated}
      />
    );
  }
};

export default Wrapped;

