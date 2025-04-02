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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [useRkeyTimestamp, setUseRkeyTimestamp] = useState(false);
  
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
  
  // Helper function to decode TID (rkey) to timestamp
  const tidToTimestamp = (tid) => {
    try {
      // TIDs use a custom base32 encoding
      const charset = '234567abcdefghijklmnopqrstuvwxyz';
      
      // Take just the timestamp part (first 10 chars)
      const timestampChars = tid.slice(0, 10);
      
      // Convert from base32
      let n = 0;
      for (let i = 0; i < timestampChars.length; i++) {
        const charIndex = charset.indexOf(timestampChars[i]);
        if (charIndex === -1) return null;
        n = n * 32 + charIndex;
      }
      
      // The timestamp is microseconds since 2023-01-01T00:00:00Z
      const baseTime = new Date('2023-01-01T00:00:00Z').getTime();
      const dateMs = baseTime + Math.floor(n / 1000);
      
      // Convert to ISO string
      return new Date(dateMs).toISOString();
    } catch (error) {
      console.error('Error decoding TID timestamp:', error);
      return null;
    }
  };

  // Helper function to extract timestamp from record
  const extractTimestamp = (record) => {
    // First check if createdAt exists directly in the value
    if (record.value?.createdAt) {
      return record.value.createdAt;
    }
    
    // Otherwise try to find a timestamp in the record
    // We'll use a recursive function to search through the object
    const findTimestamp = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      
      // Look for common timestamp fields
      const timestampFields = ['createdAt', 'indexedAt', 'timestamp', 'time', 'date'];
      for (const field of timestampFields) {
        if (obj[field] && typeof obj[field] === 'string') {
          // Check if it looks like an ISO date string
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(obj[field])) {
            return obj[field];
          }
        }
      }
      
      // Recursively search through child objects
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const found = findTimestamp(obj[key]);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Try to find a timestamp in the record
    return findTimestamp(record);
  };

  // Function to fetch records from collections
  const fetchCollectionRecords = async (userDid, endpoint, collectionsList, isLoadMore = false) => {
    try {
      setFetchingMore(isLoadMore);
      
      // Array to store all fetched records
      let allRecords = isLoadMore ? [...records] : [];
      const newCursors = { ...collectionCursors };
      
      // Calculate a cutoff date (90 days ago)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      
      // Fetch records for each collection in parallel
      const fetchPromises = collectionsList.map(async (collection) => {
        // Fetch up to 100 records per collection to ensure we get a good sample
        let url = `${endpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(userDid)}&collection=${encodeURIComponent(collection)}&limit=100`;
        
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
        return data.records.map(record => {
          const contentTimestamp = extractTimestamp(record);
          const rkey = record.uri.split('/').pop();
          const rkeyTimestamp = tidToTimestamp(rkey);
          
          return {
            ...record,
            collection,
            collectionType: record.value?.$type || collection,
            contentTimestamp,
            rkeyTimestamp,
            // We'll decide which timestamp to use when filtering/sorting
            rkey,
          };
        });
      });
      
      // Wait for all fetch operations to complete
      const collectionRecords = await Promise.all(fetchPromises);
      
      // Combine and flatten records from all collections
      collectionRecords.forEach(records => {
        allRecords = [...allRecords, ...records];
      });
      
      // Filter and sort records based on the selected timestamp source
      allRecords = allRecords.filter(record => {
        if (useRkeyTimestamp) {
          // When using rkey timestamps, include all records (all valid TIDs should have timestamps)
          return record.rkeyTimestamp !== null;
        } else {
          // When using content timestamps, only include records with valid content timestamps
          return record.contentTimestamp !== null;
        }
      }).sort((a, b) => {
        // Sort based on the selected timestamp type
        const aTime = useRkeyTimestamp ? a.rkeyTimestamp : a.contentTimestamp;
        const bTime = useRkeyTimestamp ? b.rkeyTimestamp : b.contentTimestamp;
        
        return new Date(bTime) - new Date(aTime); // Newest first
      });
      
      // If not loading more, limit to 50 most recent records for initial display
      if (!isLoadMore) {
        allRecords = allRecords.slice(0, 50);
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
                  <div 
                    className="filter-dropdown-toggle"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                  >
                    <span>
                      Filter Collections
                      {selectedCollections.length > 0 && (
                        <span className="selected-collections-count">
                          {selectedCollections.length}
                        </span>
                      )}
                    </span>
                    <span className={`arrow ${dropdownOpen ? 'open' : ''}`}>▼</span>
                  </div>
                  
                  {dropdownOpen && (
                    <div className="filter-dropdown-backdrop open" onClick={() => setDropdownOpen(false)} />
                  )}
                  
                  <div className={`filter-dropdown-menu ${dropdownOpen ? 'open' : ''}`}>
                    <div className="filter-header">
                      <h3>Select Collections</h3>
                      <div className="filter-actions">
                        <button 
                          className="select-all-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectAllCollections();
                          }}
                          disabled={collections.length === selectedCollections.length}
                        >
                          Select All
                        </button>
                        <button 
                          className="deselect-all-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deselectAllCollections();
                          }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCollection(collection);
                          }}
                        >
                          <input
                            type="checkbox"
                            className="collection-item-checkbox"
                            checked={selectedCollections.includes(collection)}
                            onChange={() => {}} // Handled by the div onClick
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollection(collection);
                            }}
                          />
                          <span className="collection-item-name">{collection}</span>
                        </div>
                      ))}
                    </div>
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
              
              <div className="feed-filters">
                <div className="timestamp-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={useRkeyTimestamp}
                      onChange={() => {
                        // When toggling, we need to re-sort the records
                        setUseRkeyTimestamp(!useRkeyTimestamp);
                        // Re-filter and re-sort the records with the new setting
                        const sorted = [...records].filter(record => {
                          if (!useRkeyTimestamp) { // We're switching to rkey timestamps
                            return record.rkeyTimestamp !== null;
                          } else { // We're switching to content timestamps
                            return record.contentTimestamp !== null;
                          }
                        }).sort((a, b) => {
                          const aTime = !useRkeyTimestamp ? a.rkeyTimestamp : a.contentTimestamp;
                          const bTime = !useRkeyTimestamp ? b.rkeyTimestamp : b.contentTimestamp;
                          return new Date(bTime) - new Date(aTime);
                        });
                        setRecords(sorted);
                      }}
                    />
                    Use Record Key Timestamps
                  </label>
                  <span title="Record keys in AT Protocol encode creation timestamps which can differ from timestamps in the record content.">ⓘ</span>
                </div>
              </div>
              
              {selectedCollections.length === 0 ? (
                <div className="no-collections-message">
                  <p>Please select at least one collection to view records.</p>
                </div>
              ) : (
                <>
                  <FeedTimeline 
                    records={filteredRecords} 
                    serviceEndpoint={serviceEndpoint}
                  />
                  
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