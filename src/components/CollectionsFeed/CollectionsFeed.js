import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SearchBar from '../SearchBar/SearchBar';
import FeedTimeline from './FeedTimeline';
import './CollectionsFeed.css';
import { resolveHandleToDid, getServiceEndpointForDid } from '../../accountData';
import MatterLoadingAnimation from '../MatterLoadingAnimation';
import { Helmet } from 'react-helmet';

const CollectionsFeed = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  
  // State variables
  const [handle, setHandle] = useState(username || '');
  const [displayName, setDisplayName] = useState('');
  const [did, setDid] = useState('');
  const [serviceEndpoint, setServiceEndpoint] = useState('');
  const [collections, setCollections] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState('');
  const [collectionCursors, setCollectionCursors] = useState({});
  const [fetchingMore, setFetchingMore] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  
  // Effect to load data if username is provided in URL
  useEffect(() => {
    if (username) {
      loadUserData(username);
    }
  }, [username]);
  
  // Function to load user data
  const loadUserData = async (userHandle) => {
    try {
      setLoading(true);
      setError('');
      
      // Update URL with the username
      if (userHandle !== username) {
        navigate(`/collections-feed/${encodeURIComponent(userHandle)}`);
      }
      
      // Resolve handle to DID
      const userDid = await resolveHandleToDid(userHandle);
      setDid(userDid);
      
      // Get service endpoint
      const endpoint = await getServiceEndpointForDid(userDid);
      setServiceEndpoint(endpoint);
      
      // Fetch profile information
      const publicApiEndpoint = "https://public.api.bsky.app";
      const profileResponse = await fetch(`${publicApiEndpoint}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(userDid)}`);
      
      if (!profileResponse.ok) {
        throw new Error(`Error fetching profile: ${profileResponse.statusText}`);
      }
      
      const profileData = await profileResponse.json();
      setHandle(profileData.handle);
      setDisplayName(profileData.displayName || profileData.handle);
      
      // Fetch repo description to get collections
      const repoResponse = await fetch(`${endpoint}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(userDid)}`);
      
      if (!repoResponse.ok) {
        throw new Error(`Error fetching repo description: ${repoResponse.statusText}`);
      }
      
      const repoData = await repoResponse.json();
      if (repoData.collections && repoData.collections.length > 0) {
        const sortedCollections = [...repoData.collections].sort();
        setCollections(sortedCollections);
        // By default, select all collections
        setSelectedCollections(sortedCollections);
        
        // Fetch records for each collection
        await fetchCollectionRecords(userDid, endpoint, sortedCollections);
      } else {
        setError('No collections found for this user.');
      }
      
      setSearchPerformed(true);
      setInitialLoad(false);
      setLoading(false);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError(err.message || 'An error occurred while loading data.');
      setInitialLoad(false);
      setLoading(false);
    }
  };
  
  // Function to fetch records from collections
  const fetchCollectionRecords = async (userDid, endpoint, collectionsList, isLoadMore = false) => {
    try {
      setFetchingMore(isLoadMore);
      
      // Array to store all fetched records
      let allRecords = isLoadMore ? [...records] : [];
      const newCursors = { ...collectionCursors };
      
      // Fetch records for each collection in parallel
      const fetchPromises = collectionsList.map(async (collection) => {
        // Limit to 5 records per collection initially (for 20 records total across ~4 collections)
        let url = `${endpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(userDid)}&collection=${encodeURIComponent(collection)}&limit=5`;
        
        // Add cursor if loading more and we have a cursor for this collection
        if (isLoadMore && newCursors[collection]) {
          url += `&cursor=${encodeURIComponent(newCursors[collection])}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`Error fetching records for ${collection}: ${response.statusText}`);
          return [];
        }
        
        const data = await response.json();
        
        // Save cursor for next pagination
        if (data.cursor) {
          newCursors[collection] = data.cursor;
        } else {
          // No more records for this collection
          delete newCursors[collection];
        }
        
        // Process and format records
        return data.records.map(record => ({
          ...record,
          collection,
          collectionType: record.value?.$type || collection,
          timestamp: record.value?.createdAt || null,
          rkey: record.uri.split('/').pop(),
        }));
      });
      
      // Wait for all fetch operations to complete
      const collectionRecords = await Promise.all(fetchPromises);
      
      // Combine and flatten records from all collections
      collectionRecords.forEach(records => {
        allRecords = [...allRecords, ...records];
      });
      
      // Sort records by timestamp (newest first)
      allRecords.sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
      
      // If not loading more, limit to 20 most recent records
      if (!isLoadMore) {
        allRecords = allRecords.slice(0, 20);
      }
      
      setRecords(allRecords);
      setCollectionCursors(newCursors);
      setFetchingMore(false);
    } catch (err) {
      console.error('Error fetching collection records:', err);
      setError('Failed to fetch records. Please try again.');
      setFetchingMore(false);
    }
  };
  
  // Toggle collection selection
  const toggleCollection = (collection) => {
    if (selectedCollections.includes(collection)) {
      setSelectedCollections(prev => prev.filter(item => item !== collection));
    } else {
      setSelectedCollections(prev => [...prev, collection]);
    }
  };
  
  // Select all collections
  const selectAllCollections = () => {
    setSelectedCollections([...collections]);
  };
  
  // Deselect all collections
  const deselectAllCollections = () => {
    setSelectedCollections([]);
  };
  
  // Handle refresh button click
  const handleRefresh = async () => {
    if (did && serviceEndpoint) {
      await fetchCollectionRecords(did, serviceEndpoint, selectedCollections);
    }
  };
  
  // Handle load more button click
  const handleLoadMore = async () => {
    if (did && serviceEndpoint && Object.keys(collectionCursors).length > 0) {
      // Only load more from collections that have cursors and are selected
      const collectionsToLoad = selectedCollections.filter(collection => collectionCursors[collection]);
      
      if (collectionsToLoad.length > 0) {
        await fetchCollectionRecords(did, serviceEndpoint, collectionsToLoad, true);
      }
    }
  };
  
  // Filter records based on selected collections
  const filteredRecords = records.filter(record => 
    selectedCollections.includes(record.collection)
  );
  
  // Check if more records can be loaded
  const canLoadMore = Object.keys(collectionCursors).some(collection => 
    selectedCollections.includes(collection)
  );
  
  return (
    <div className="collections-feed-container">
      <Helmet>
        <title>{username ? `${username}'s Collections Feed` : 'Collections Feed'}</title>
        <meta name="description" content={username ? `View ${username}'s AT Protocol collection records in chronological order` : 'View AT Protocol collection records in chronological order'} />
      </Helmet>
      
      {initialLoad && !username ? (
        <div className="search-container">
          <h1>Collections Feed</h1>
          <p className="intro-text">
            Enter a Bluesky handle to see their AT Protocol collection records in chronological order.
          </p>
          <div className="search-bar-container">
            <form className="search-bar" onSubmit={(e) => {
              e.preventDefault();
              if (handle.trim() !== "") {
                loadUserData(handle.trim());
              }
            }} role="search">
              <input
                type="text"
                placeholder="(e.g. user.bsky.social)"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                required
              />
              <button type="submit">Search</button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {loading && !fetchingMore ? (
            <div className="loading-container">
              <MatterLoadingAnimation />
            </div>
          ) : error ? (
            <div className="error-container">
              <h2>Error</h2>
              <p className="error-message">{error}</p>
              <button 
                className="try-again-button"
                onClick={() => navigate('/collections-feed')}
              >
                Try Another Account
              </button>
            </div>
          ) : searchPerformed && (
            <div className="feed-container">
              <div className="user-header">
                <h1>{displayName}</h1>
                <h2>@{handle}</h2>
              </div>
              
              <div className="feed-controls">
                <div className="filter-container">
                  <div className="filter-header">
                    <h3>Filter Collections</h3>
                    <div className="filter-actions">
                      <button 
                        className="select-all-button"
                        onClick={selectAllCollections}
                        disabled={collections.length === selectedCollections.length}
                      >
                        Select All
                      </button>
                      <button 
                        className="deselect-all-button"
                        onClick={deselectAllCollections}
                        disabled={selectedCollections.length === 0}
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  
                  <div className="collections-filter">
                    {collections.map(collection => (
                      <div 
                        key={collection} 
                        className={`collection-item ${selectedCollections.includes(collection) ? 'selected' : ''}`}
                        onClick={() => toggleCollection(collection)}
                      >
                        <input
                          type="checkbox"
                          className="collection-item-checkbox"
                          checked={selectedCollections.includes(collection)}
                          onChange={() => {}} // Handled by the div onClick
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="collection-item-name">{collection}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <button 
                  className="refresh-button"
                  onClick={handleRefresh}
                  disabled={loading || selectedCollections.length === 0}
                >
                  Refresh
                </button>
              </div>
              
              {selectedCollections.length === 0 ? (
                <div className="no-collections-message">
                  <p>Please select at least one collection to view records.</p>
                </div>
              ) : (
                <>
                  <FeedTimeline records={filteredRecords} />
                  
                  {filteredRecords.length === 0 && (
                    <div className="no-records-message">
                      <p>No records found for the selected collections.</p>
                    </div>
                  )}
                  
                  {filteredRecords.length > 0 && canLoadMore && (
                    <div className="load-more-container">
                      <button 
                        className="load-more-button"
                        onClick={handleLoadMore}
                        disabled={fetchingMore}
                      >
                        {fetchingMore ? 'Loading...' : 'Load More Records'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CollectionsFeed;