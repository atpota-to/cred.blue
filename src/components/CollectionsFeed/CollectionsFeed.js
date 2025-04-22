import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SearchBar from '../SearchBar/SearchBar';
import FeedTimeline from './FeedTimeline';
import ActivityChart from './ActivityChart';
import './CollectionsFeed.css'; // Renamed to Omnifeed.css but keeping same filename for compatibility
import { resolveHandleToDid, getServiceEndpointForDid } from '../../accountData';
import MatterLoadingAnimation from '../MatterLoadingAnimation';
import { Helmet } from 'react-helmet';
import { useAuth } from '../../contexts/AuthContext';

// Define the backend API base URL
const API_BASE_URL = 'https://api.cred.blue';

const CollectionsFeed = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  // Initialize state variables
  const [handle, setHandle] = useState(username || '');
  const [searchTerm, setSearchTerm] = useState(username || '');
  const [displayName, setDisplayName] = useState('');
  const [did, setDid] = useState('');
  const [serviceEndpoint, setServiceEndpoint] = useState('');
  const [collections, setCollections] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [records, setRecords] = useState([]);
  const [allRecordsForChart, setAllRecordsForChart] = useState([]); // All records for chart visualization
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [chartLoading, setChartLoading] = useState(false); // Separate loading state for chart data
  const [error, setError] = useState('');
  const [collectionCursors, setCollectionCursors] = useState({});
  const [fetchingMore, setFetchingMore] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [useRkeyTimestamp, setUseRkeyTimestamp] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [displayCount, setDisplayCount] = useState(25);
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showContent, setShowContent] = useState(false); // Add state for content visibility
  
  // Helper functions
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
  
  // Define fetchCollectionRecords with useCallback first
  const fetchCollectionRecords = useCallback(async (userDid, endpoint, collectionsList, isLoadMore = false) => {
    try {
      if (!isLoadMore) {
        setChartLoading(true);
      }
      
      // Skip if no collections selected
      if (!collectionsList || collectionsList.length === 0) {
        console.log('No collections to fetch');
        setFetchingMore(false);
        setChartLoading(false);
        return;
      }
      
      console.log(`Fetching records for ${collectionsList.length} collections:`, collectionsList);

      // Create a copy of the cursors
      const newCursors = { ...collectionCursors };
      
      let allRecords = [];
      let allChartRecords = [];
      
      // Check if we need full history for the initial deep load
      const isInitialDeepLoad = !isLoadMore && allRecordsForChart.length === 0;
      
      // Sequential processing for each collection to avoid overloading the API
      for (const collection of collectionsList) {
        let hasMoreRecords = true;
        let cursor = isLoadMore ? newCursors[collection] : null;
        let pageCount = 0;
        let collectionRecords = [];
        let reachedCutoff = false;
        
        // For initial deep load, we need to paginate as many times as needed to get all historical data
        // For regular timeline browsing or load more, we just get one page
        // Set a high limit for safety, but essentially allow unlimited pagination until we hit the cutoff date
        const maxPages = isInitialDeepLoad ? 1000 : 1; 
        
        while (hasMoreRecords && pageCount < maxPages && !reachedCutoff) {
          // Use our server-side API to fetch records - Use absolute URL
          let url = `${API_BASE_URL}/api/collections/${encodeURIComponent(userDid)}/records?endpoint=${encodeURIComponent(endpoint)}&collection=${encodeURIComponent(collection)}&limit=100`;
          
          // Add cursor if we have one
          if (cursor) {
            url += `&cursor=${encodeURIComponent(cursor)}`;
          }
          
          try {
            const response = await fetch(url);
            
            if (!response.ok) {
              let errorMessage;
              try {
                const errorData = await response.json();
                errorMessage = errorData?.error || errorData?.details || response.statusText;
              } catch (jsonErr) {
                errorMessage = response.statusText || `HTTP ${response.status}`;
              }
              
              console.error(`Error fetching records for ${collection}: ${errorMessage}`);
              
              // Skip this collection but continue with others
              break;
            }
            
            const data = await response.json();
            pageCount++;
            
            // Process each record to extract timestamps
            if (data.records && data.records.length > 0) {
              // Process and add timestamps to records
              const processedRecords = data.records.map(record => {
                const contentTimestamp = extractTimestamp(record);
                const rkey = record.uri.split('/').pop();
                const rkeyTimestamp = tidToTimestamp(rkey);
                
                return {
                  ...record,
                  collection,
                  collectionType: record.value?.$type || collection,
                  contentTimestamp,
                  rkeyTimestamp,
                  rkey,
                };
              });
              
              // Add records to our collection records array
              collectionRecords = [...collectionRecords, ...processedRecords];
              
              // Check if we need to continue fetching more pages for this collection
              if (data.cursor && isInitialDeepLoad) {
                cursor = data.cursor;
                
                // Check if we've reached our history cutoff date
                const oldestRecord = processedRecords[processedRecords.length - 1];
                const timestamp = useRkeyTimestamp ? oldestRecord.rkeyTimestamp : oldestRecord.contentTimestamp;
                
                if (timestamp) {
                  const recordDate = new Date(timestamp);
                  const cutoffDate = new Date();
                  cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago
                  
                  if (recordDate < cutoffDate) {
                    console.log(`Reached cutoff date for ${collection}, stopping pagination`);
                    reachedCutoff = true;
                  }
                }
              } else {
                hasMoreRecords = false;
              }
            } else {
              hasMoreRecords = false;
            }
            
            // Store the cursor for this collection for future "load more" operations
            newCursors[collection] = data.cursor;
          } catch (error) {
            console.error(`Error processing collection ${collection}:`, error);
            // Continue with other collections
            break;
          }
        } // End of pagination while loop
        
        // Add all records from this collection to our full records arrays
        allChartRecords = [...allChartRecords, ...collectionRecords];
        
        // For display timeline, we might want to be more selective
        if (isLoadMore || !isInitialDeepLoad) {
          allRecords = [...allRecords, ...collectionRecords];
        }
      } // End of collections for loop
      
      // If we didn't get any records, set an error
      if (allChartRecords.length === 0 && !isLoadMore) {
        setError('No records found for the selected collections.');
      } else if (isLoadMore && allRecords.length === 0) {
        setError('No more records available.');
      } else {
        // Clear any previous error since we got records
        setError('');
      }
      
      // Filter and sort records based on selected timestamp source
      const filterAndSort = (recordArray) => recordArray.filter(record => {
        // Only include records with valid timestamps based on selected mode
        if (useRkeyTimestamp) {
          return record.rkeyTimestamp !== null;
        } else {
          return record.contentTimestamp !== null;
        }
      }).sort((a, b) => {
        // Sort newest first
        const aTime = useRkeyTimestamp ? a.rkeyTimestamp : a.contentTimestamp;
        const bTime = useRkeyTimestamp ? b.rkeyTimestamp : b.contentTimestamp;
        return new Date(bTime) - new Date(aTime);
      });
      
      // Process chart records
      const sortedChartRecords = filterAndSort(allChartRecords);
      
      // For timeline display
      let displayRecords;
      if (isInitialDeepLoad) {
        // If this was the initial deep load, take the most recent records for display
        displayRecords = sortedChartRecords.slice(0, 20);
      } else {
        // Otherwise process the display records separately
        displayRecords = filterAndSort(allRecords);
      }
      
      // In the case of a refresh, sortedChartRecords only contains fresh data for selected collections
      // We need to merge this with any existing data for other collections
      const existingRecordsToKeep = isLoadMore ? [] : allRecordsForChart.filter(record => 
        !collectionsList.includes(record.collection)
      );
      
      // Variable to hold our final merged records
      let mergedRecords;
      
      // For refresh, remove old data for the collections we just refreshed
      if (!isLoadMore) {
        // Remove duplicates that might exist in both arrays
        // This can happen if we refreshed a collection we already had data for
        const uniqueNewRecords = sortedChartRecords.filter(newRecord => {
          // Check if this record has the exact same URI as an existing record
          return !existingRecordsToKeep.some(existingRecord => 
            existingRecord.uri === newRecord.uri
          );
        });
        
        // Merge fresh data with existing data for other collections
        mergedRecords = [...existingRecordsToKeep, ...uniqueNewRecords];
      }
      else {
        // For load more, just add all the new records
        mergedRecords = [...existingRecordsToKeep, ...sortedChartRecords];
      }
      
      // Update state
      setRecords(displayRecords);
      setAllRecordsForChart(mergedRecords);
      setCollectionCursors(newCursors);
      setFetchingMore(false);
      
      // Always set chartLoading to false when done, regardless of initial state
      setChartLoading(false);
      
    } catch (err) {
      console.error('Error fetching collection records:', err);
      setError(`Failed to load records: ${err.message}`);
      setFetchingMore(false);
      setChartLoading(false);
    }
  }, [navigate]);
  
  // Now define loadUserData after fetchCollectionRecords is defined
  const loadUserData = useCallback(async (usernameOrDid) => {
    if (!usernameOrDid) {
      setError('Please enter a username or DID.');
      return;
    }
    
    // Reset state for new search
    setLoading(true);
    setShowContent(false); // Hide content while loading
    setError('');
    setDid('');
    setServiceEndpoint('');
    setCollections([]);
    setSelectedCollections([]);
    setRecords([]);
    setAllRecordsForChart([]);
    setCollectionCursors({});
    
    try {
      // Continue with resolving the handle to DID
      let userDid = usernameOrDid;
      
      // If input doesn't look like a DID, try to resolve it as a handle
      if (!userDid.startsWith('did:')) {
        try {
          userDid = await resolveHandleToDid(usernameOrDid);
        } catch (resolveErr) {
          setError(`Could not resolve handle: ${resolveErr.message}`);
          setLoading(false);
          return;
        }
      }
      
      // Get service endpoint
      let endpoint;
      try {
        endpoint = await getServiceEndpointForDid(userDid);
        setServiceEndpoint(endpoint);
      } catch (endpointError) {
        console.error('Error getting service endpoint:', endpointError);
        setError(`Could not determine PDS endpoint for "${userDid}". The user's server may be offline.`);
        setInitialLoad(false);
        setLoading(false);
        return;
      }
      
      // Fetch profile information
      try {
        const publicApiEndpoint = "https://public.api.bsky.app";
        const profileResponse = await fetch(`${publicApiEndpoint}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(userDid)}`);
        
        if (!profileResponse.ok) {
          throw new Error(`Error fetching profile: ${profileResponse.statusText}`);
        }
        
        const profileData = await profileResponse.json();
        setHandle(profileData.handle);
        setDisplayName(profileData.displayName || profileData.handle);
      } catch (profileError) {
        console.error('Error fetching profile:', profileError);
        // Continue without profile data, not critical
      }
      
      // Use our server-side API to fetch collections - Use absolute URL
      try {
        const collectionsResponse = await fetch(`${API_BASE_URL}/api/collections/${encodeURIComponent(userDid)}?endpoint=${encodeURIComponent(endpoint)}`);
        
        if (!collectionsResponse.ok) {
          throw new Error(`Error fetching collections: ${collectionsResponse.statusText}`);
        }
        
        const collectionsData = await collectionsResponse.json();
        
        if (collectionsData.collections && collectionsData.collections.length > 0) {
          const sortedCollections = [...collectionsData.collections].sort();
          setCollections(sortedCollections);
          // By default, select all collections
          setSelectedCollections(sortedCollections);
          
          // Fetch records for each collection
          await fetchCollectionRecords(userDid, endpoint, sortedCollections);
        } else {
          setError('No collections found for this user.');
        }
      } catch (err) {
        console.error(`Error fetching collections:`, err);
        throw err; // Propagate error
      }
      
      setSearchPerformed(true);
      setInitialLoad(false);
      setLoading(false);
      // Add a slight delay before showing content for smooth transition
      setTimeout(() => setShowContent(true), 100);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError(err.message || 'An error occurred while loading data.');
      setInitialLoad(false);
      setLoading(false);
      setShowContent(true); // Show content even on error so user can see error message
    }
  }, [navigate, fetchCollectionRecords]);
  
  // Now place useEffects after all the callbacks are defined
  
  // Verify authentication first
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        setLoading(true);
        setInitialLoad(true);
        setShowContent(false);
        
        // Reset states if username changes
        if (username) {
          setError('');
          setSearchTerm(username);
        }
        
        // If a username is provided in the URL, load that user's data
        if (username && isAuthenticated) {
          console.log('Username provided in URL, loading data for:', username);
          loadUserData(username);
        } else {
          // Only set loading to false if we're not loading a specific user
          setLoading(false);
          setInitialLoad(false);
          setShowContent(true);
        }
      } catch (err) {
        console.error('Auth verification failed:', err);
        setError('Authentication failed. Please try logging in again.');
        setLoading(false);
        setInitialLoad(false);
        setShowContent(true);
        
        // Add a delay before redirecting to show the error message
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    };
    
    verifyAuth();
    
    // Safety timeout to ensure initialLoad is cleared after 10 seconds maximum
    const loadingTimeout = setTimeout(() => {
      setInitialLoad(false);
    }, 10000);
    
    return () => {
      clearTimeout(loadingTimeout);
    };
  }, [isAuthenticated, navigate, username, loadUserData]);
  
  // Effect to watch for selected collections changes
  useEffect(() => {
    // Only trigger a data fetch when filters change if we haven't fetched enough data previously
    if (selectedCollections.length > 0 && did && serviceEndpoint && searchPerformed) {
      const hasUnfetchedCollections = selectedCollections.some(col => 
        !allRecordsForChart.some(record => record.collection === col)
      );
      
      if (hasUnfetchedCollections) {
        // Only fetch collections we haven't fetched before
        const collectionsToFetch = selectedCollections.filter(col => 
          !allRecordsForChart.some(record => record.collection === col)
        );
        
        if (collectionsToFetch.length > 0) {
          console.log(`Fetching data for new collections: ${collectionsToFetch.join(', ')}`);
          fetchCollectionRecords(did, serviceEndpoint, collectionsToFetch);
        }
      } else {
        console.log('All collections already fetched, just filtering existing data');
      }
    }
  }, [selectedCollections, did, serviceEndpoint, searchPerformed, allRecordsForChart, fetchCollectionRecords]);
  
  // Toggle collection selection
  const toggleCollection = (collection) => {
    if (selectedCollections.includes(collection)) {
      setSelectedCollections(prev => prev.filter(item => item !== collection));
    } else {
      setSelectedCollections(prev => [...prev, collection]);
    }
    // Reset display count when changing collections
    setDisplayCount(25);
    // We don't need to manually refresh here since we added a useEffect hook
    // that watches for changes to selectedCollections
  };
  
  // Select all collections
  const selectAllCollections = () => {
    setSelectedCollections([...collections]);
    // Reset display count when changing collections
    setDisplayCount(25);
    // We don't need to manually refresh here since we added a useEffect hook
    // that watches for changes to selectedCollections
  };
  
  // Deselect all collections
  const deselectAllCollections = () => {
    setSelectedCollections([]);
    // Reset display count
    setDisplayCount(25);
    // No need to refresh as we'll show "no collections selected" message
  };
  
  // Toggle dropdown
  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };
  
  // Close dropdown when clicking outside
  const closeDropdown = useCallback((e) => {
    if (dropdownOpen && e.target.closest('.filter-dropdown-menu') === null && 
        e.target.closest('.filter-dropdown-toggle') === null) {
      setDropdownOpen(false);
    }
  }, [dropdownOpen]);
  
  // Add event listener to detect clicks outside the dropdown
  useEffect(() => {
    document.addEventListener('mousedown', closeDropdown);
    return () => {
      document.removeEventListener('mousedown', closeDropdown);
    };
  }, [closeDropdown]);
  
  // Handle refresh button click - only updates the feed, not the chart
  const handleRefresh = async () => {
    if (did && serviceEndpoint) {
      // Set a loading state but not for the chart
      setLoading(true);
      
      // Reset display count to show only the first 25 records after refresh
      setDisplayCount(25);
      
      try {
        // Fetch just the most recent records for the feed display
        const refreshOnlyFeed = async () => {
          let recentRecords = [];
          
          // Process each selected collection sequentially
          for (const collection of selectedCollections) {
            try {
              // Use server-side API endpoint for fetching records - Use absolute URL
              const url = `${API_BASE_URL}/api/collections/${encodeURIComponent(did)}/records?endpoint=${encodeURIComponent(serviceEndpoint)}&collection=${encodeURIComponent(collection)}&limit=25`;
              
              const response = await fetch(url);
              
              if (!response.ok) {
                console.error(`Error refreshing ${collection}: ${response.statusText}`);
                continue; // Skip this collection but continue with others
              }
              
              const data = await response.json();
              
              if (data.records && data.records.length > 0) {
                // Process the records with timestamps
                const processedRecords = data.records.map(record => {
                  const contentTimestamp = extractTimestamp(record);
                  const rkey = record.uri.split('/').pop();
                  const rkeyTimestamp = tidToTimestamp(rkey);
                  
                  return {
                    ...record,
                    collection,
                    collectionType: record.value?.$type || collection,
                    contentTimestamp,
                    rkeyTimestamp,
                    rkey,
                  };
                });
                
                // Add to our records array
                recentRecords = [...recentRecords, ...processedRecords];
              }
            } catch (err) {
              console.error(`Error refreshing collection ${collection}:`, err);
              // Continue with other collections
            }
          }
          
          // Sort the refreshed records by timestamp (newest first)
          const sortedRecords = recentRecords.filter(record => {
            if (useRkeyTimestamp) {
              return record.rkeyTimestamp !== null;
            } else {
              return record.contentTimestamp !== null;
            }
          }).sort((a, b) => {
            const aTime = useRkeyTimestamp ? a.rkeyTimestamp : a.contentTimestamp;
            const bTime = useRkeyTimestamp ? b.rkeyTimestamp : b.contentTimestamp;
            return new Date(bTime) - new Date(aTime);
          });
          
          // Only update the feed display records, not the chart data
          setRecords(sortedRecords.slice(0, 25));
        };
        
        await refreshOnlyFeed();
      } catch (err) {
        console.error("Error during feed refresh:", err);
        setError('Failed to refresh records. Please try again.');
      } finally {
        // Ensure loading state is reset
        setLoading(false);
      }
    }
  };
  
  // Handle load more button click
  const handleLoadMore = async () => {
    setFetchingMore(true);
    
    // First check if we already have more records locally that we can show
    if (hasMoreRecordsLocally) {
      // Simply increase the display count by 25 more records
      const nextBatchSize = 25;
      setDisplayCount(prevCount => prevCount + nextBatchSize);
      
      setFetchingMore(false);
    } 
    // If we've displayed all local records but have cursors to fetch more from the API
    else if (hasMoreRecordsRemotely) {
      // Only load more from collections that have cursors and are selected
      const collectionsToLoad = selectedCollections.filter(collection => collectionCursors[collection]);
      
      if (collectionsToLoad.length > 0) {
        try {
          await fetchCollectionRecords(did, serviceEndpoint, collectionsToLoad, true);
          // After fetching more, we can increase the display count to show them
          setDisplayCount(prevCount => prevCount + 25);
        } catch (error) {
          setError('Failed to load more records. Please try again.');
        }
      } else {
        setFetchingMore(false);
      }
    } else {
      setFetchingMore(false);
    }
  };
  
  // Filter ALL chart records based on selected collections
  const filteredChartRecords = allRecordsForChart.filter(record => 
    selectedCollections.includes(record.collection)
  );

  // For timeline display, directly use the chart records but limit to the current displayCount
  // This ensures we always show the most recent records for the selected collections
  const filteredRecords = filteredChartRecords
    .sort((a, b) => {
      // Sort by timestamp (newest first)
      const aTime = useRkeyTimestamp ? a.rkeyTimestamp : a.contentTimestamp;
      const bTime = useRkeyTimestamp ? b.rkeyTimestamp : b.contentTimestamp;
      return new Date(bTime) - new Date(aTime);
    })
    .slice(0, displayCount); // Show based on displayCount state
  
  // Check if more records can be loaded - either from API or from our existing dataset
  const hasMoreRecordsLocally = filteredChartRecords.length > filteredRecords.length;
  const hasMoreRecordsRemotely = Object.keys(collectionCursors).some(collection => 
    selectedCollections.includes(collection)
  );
  const canLoadMore = hasMoreRecordsLocally || hasMoreRecordsRemotely;
  
  // Add the handleSubmit function
  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim() !== '') {
      // Instead of directly loading the user data, navigate to their dedicated omnifeed page
      navigate(`/omnifeed/${searchTerm.trim()}`);
    }
  };
  
  // Add a function to fetch debug info - Use absolute API URL
  const fetchDebugInfo = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/debug/session`, { // Use absolute URL
        credentials: 'include' // Keep credentials if needed for debug endpoint
      });
      
      if (!response.ok) {
        setDebugInfo({ error: `Server returned ${response.status}: ${response.statusText}` });
        return;
      }
      
      const data = await response.json();
      setDebugInfo(data);
    } catch (error) {
      console.error('Error fetching debug info:', error);
      setDebugInfo({ error: error.message });
    }
    
    setShowDebug(true);
  };
  
  return (
    <div className="collections-feed-container">
      <Helmet>
        <title>{username ? `${username}'s Omnifeed` : 'Omnifeed'}</title>
        <meta name="description" content={username ? `View ${username}'s AT Protocol collection records in chronological order` : 'View AT Protocol collection records in chronological order'} />
      </Helmet>
      
      {/* Display MatterLoadingAnimation for the main loading state when username is provided */}
      {username && loading && !error && (
        <div className="matter-loading-container">
          <MatterLoadingAnimation />
        </div>
      )}
      
      {/* Only show the main content when not in full-screen loading mode */}
      {(!username || !loading || error || showContent) && (
        <div className={`search-container ${showContent ? 'fade-in' : ''}`}>
          <h1>OmniFeed</h1>
          <p className="feed-description">
            View all repository collections for a Bluesky user, including custom collections from AT Protocol apps.
          </p>
          
          <form onSubmit={handleSubmit} className="search-form">
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Enter a Bluesky handle (e.g. cred.blue)" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={loading}
              />
              <button 
                type="submit" 
                disabled={loading || !searchTerm || searchTerm.trim() === ''}
              >
                {loading ? 'Loading...' : 'Search'}
              </button>
            </div>
          </form>
          
          {/* Error message with more styling and retry button */}
          {error && (
            <div className="error-container">
              <div className="error-message">
                <p>{error}</p>
                <button 
                  className="error-action-button"
                  onClick={() => {
                    setError('');
                    if (username) {
                      loadUserData(username);
                    }
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          
          {/* Show simpler loading spinner when searching from the form, not the full MatterLoadingAnimation */}
          {!username && initialLoad && !error && (
            <div className="loading-indicator">
              <div className="spinner"></div>
              <p>Connecting to AT Protocol services...</p>
            </div>
          )}
          
          {/* Main content once search is performed */}
          {searchPerformed && !initialLoad && (
            <div className="user-info">
              {displayName && (
                <h2>
                  Collections for {displayName}
                  <span className="handle">@{handle}</span>
                </h2>
              )}
              
              {/* Collections count and timeframe */}
              {collections.length > 0 && (
                <div className="collections-meta">
                  <p>{collections.length} collections found</p>
                  <div className="time-toggle">
                    <label>
                      <input
                        type="checkbox"
                        checked={useRkeyTimestamp}
                        onChange={() => setUseRkeyTimestamp(!useRkeyTimestamp)}
                      />
                      Use record IDs for timestamps
                    </label>
                    <span className="info-tooltip">
                      ?
                      <span className="tooltip-text">
                        Toggle between using timestamps found within the content (more accurate) or derived from record IDs (complete coverage)
                      </span>
                    </span>
                  </div>
                </div>
              )}
              
              {/* Collections filter area */}
              {collections.length > 0 && (
                <div className="feed-controls">
                  <div className="filter-container">
                    <div 
                      className="filter-dropdown-toggle" 
                      onClick={toggleDropdown}
                    >
                      <span>
                        Collections 
                        <span className="selected-collections-count">
                          {selectedCollections.length}
                        </span>
                      </span>
                      <span className={`arrow ${dropdownOpen ? 'open' : ''}`}>▼</span>
                    </div>
                    
                    <div className={`filter-dropdown-menu ${dropdownOpen ? 'open' : ''}`}>
                      <div className="filter-header">
                        <div className="filter-header-top">
                          <h3>Collections</h3>
                          <button className="filter-close-mobile" onClick={() => setDropdownOpen(false)}>
                            ✕
                          </button>
                        </div>
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
                              onChange={() => toggleCollection(collection)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="collection-item-name">{collection}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {dropdownOpen && <div className="filter-dropdown-backdrop open" onClick={() => setDropdownOpen(false)}></div>}
                  </div>
                  
                  <button 
                    onClick={handleRefresh} 
                    className="refresh-button" 
                    disabled={loading || fetchingMore || selectedCollections.length === 0}
                  >
                    {loading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              )}
              
              {/* Loading indicator for chart update */}
              {chartLoading && (
                <div className="chart-loading">
                  <div className="spinner"></div>
                  <p>Loading historical data for visualization...</p>
                </div>
              )}
              
              {/* Activity Chart */}
              {!chartLoading && filteredChartRecords.length > 0 && (
                <div className="omni-chart-container">
                  <h3>Activity Timeline</h3>
                  <ActivityChart 
                    records={filteredChartRecords} 
                    useRkeyTimestamp={useRkeyTimestamp}
                  />
                </div>
              )}
              
              {/* Feed heading */}
              {selectedCollections.length > 0 && (
                <>
                  <h3 className="feed-heading">Record Feed</h3>
                  {filteredRecords.length === 0 && !loading && (
                    <p className="no-records-message">No records found for the selected collections.</p>
                  )}
                </>
              )}
              
              {/* Feed records */}
              {selectedCollections.length === 0 ? (
                <p className="no-collections-selected">Select at least one collection to see records.</p>
              ) : (
                <>
                  <FeedTimeline 
                    records={filteredRecords} 
                    useRkeyTimestamp={useRkeyTimestamp}
                    loading={loading}
                  />
                  
                  {/* Load more button */}
                  {filteredRecords.length > 0 && (hasMoreRecordsLocally || hasMoreRecordsRemotely) && (
                    <div className="load-more-container">
                      <button 
                        onClick={handleLoadMore} 
                        disabled={fetchingMore}
                        className="load-more-button"
                      >
                        {fetchingMore ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {!searchPerformed && !loading && !username && (
            <p>Enter a username above to get started.</p> // Initial state message
          )}
        </div>
      )}
      
      {/* Debug button */}
      <div className="debug-controls">
        <button 
          className="debug-button" 
          onClick={fetchDebugInfo}
          title="Check authentication status"
        >
          Debug Auth
        </button>
        
        {showDebug && debugInfo && (
          <div className="debug-panel">
            <div className="debug-header">
              <h4>Session Debug Info</h4>
              <button onClick={() => setShowDebug(false)}>Close</button>
            </div>
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectionsFeed;