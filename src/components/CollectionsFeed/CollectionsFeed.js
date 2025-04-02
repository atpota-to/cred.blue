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

const CollectionsFeed = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, checkAuthStatus } = useAuth();
  
  // State variables
  const [handle, setHandle] = useState(username || '');
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
      setFetchingMore(isLoadMore);
      
      // Set chartLoading for initial load or when refreshing
      if (!isLoadMore || collectionsList.length > 0) {
        setChartLoading(true);
      }
      
      // Arrays to store all fetched records
      let allRecords = isLoadMore ? [...records] : [];
      let allChartRecords = isLoadMore ? [...allRecordsForChart] : [];
      const newCursors = { ...collectionCursors };
      
      // Calculate a cutoff date (90 days ago by default for chart visualization)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90); // 3 months
      
      // Flag to track if we're doing a deep initial load for chart data
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
          // Use our server-side API to fetch records
          let url = `/api/collections/${encodeURIComponent(userDid)}/records?endpoint=${encodeURIComponent(endpoint)}&collection=${encodeURIComponent(collection)}&limit=100`;
          
          // Add cursor if we have one
          if (cursor) {
            url += `&cursor=${encodeURIComponent(cursor)}`;
          }
          
          const response = await fetch(url, {
            credentials: 'include'
          });
          
          if (!response.ok) {
            if (response.status === 401) {
              // Handle unauthorized
              checkAuthStatus();
              throw new Error('Authentication required. Please log in again.');
            }
            console.error(`Error fetching records for ${collection}: ${response.statusText}`);
            break;
          }
          
          const data = await response.json();
          pageCount++;
          
          // Process records from this page
          if (data.records && data.records.length > 0) {
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
            
            // For deep load, check if we've reached records beyond our cutoff
            if (isInitialDeepLoad) {
              const oldestRecordTime = processedRecords.reduce((oldest, record) => {
                const timestamp = record.contentTimestamp || record.rkeyTimestamp;
                if (!timestamp) return oldest;
                
                const recordTime = new Date(timestamp).getTime();
                return recordTime < oldest ? recordTime : oldest;
              }, Date.now());
              
              // For commonly used collections like likes, follows, etc.,
              // we need to be more cautious about when to stop paginating
              const isHighVolumeCollection = collection.includes('like') || 
                                            collection.includes('follow') || 
                                            collection.includes('repost');
                
              // If the oldest record on this page is older than our cutoff, and
              // 1. It's not a high volume collection, OR
              // 2. It's a high volume collection but we've already gone through several pages
              if (oldestRecordTime < cutoffDate.getTime() && 
                  (!isHighVolumeCollection || pageCount > 5)) {
                reachedCutoff = true;
                console.log(`Reached cutoff date for ${collection} on page ${pageCount} (oldest: ${new Date(oldestRecordTime).toISOString()})`);
                
                // Filter records from this page to only include those after cutoff
                const filteredRecords = processedRecords.filter(record => {
                  const timestamp = record.contentTimestamp || record.rkeyTimestamp;
                  if (!timestamp) return false;
                  return new Date(timestamp) >= cutoffDate;
                });
                
                console.log(`  - Kept ${filteredRecords.length} of ${processedRecords.length} records from final page`);
                collectionRecords.push(...filteredRecords);
              } else {
                // All records on this page are within our date range 
                // OR we need to keep paginating through high-volume collections
                collectionRecords.push(...processedRecords);
              }
            } else {
              // For regular browsing, include all records from the page
              collectionRecords.push(...processedRecords);
            }
          }
          
          // Check if there are more pages
          if (data.cursor) {
            cursor = data.cursor;
          } else {
            hasMoreRecords = false;
          }
          
          // If we're not doing deep historical loading, stop after first page
          if (!isInitialDeepLoad) {
            break;
          }
        }
        
        // Save the cursor for this collection for future pagination
        if (cursor) {
          newCursors[collection] = cursor;
        } else {
          // No more records for this collection
          delete newCursors[collection];
        }
        
        // Add records to appropriate arrays
        allChartRecords = [...allChartRecords, ...collectionRecords];
        
        // For display timeline, we might want to be more selective
        if (isLoadMore || !isInitialDeepLoad) {
          allRecords = [...allRecords, ...collectionRecords];
        }
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
      setError('Failed to fetch records. Please try again.');
      setFetchingMore(false);
      setChartLoading(false); // Always reset on error
      throw err; // Re-throw to allow handling in calling functions
    }
  }, [records, allRecordsForChart, collectionCursors, useRkeyTimestamp, checkAuthStatus]);
  
  // Now define loadUserData after fetchCollectionRecords is defined
  const loadUserData = useCallback(async (userHandle) => {
    try {
      setLoading(true);
      setError('');
      
      // Update URL with the username
      if (userHandle !== username) {
        navigate(`/omnifeed/${encodeURIComponent(userHandle)}`);
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
      
      // Use our server-side API to fetch collections
      const collectionsResponse = await fetch(`/api/collections/${encodeURIComponent(userDid)}?endpoint=${encodeURIComponent(endpoint)}`, {
        credentials: 'include'
      });
      
      if (!collectionsResponse.ok) {
        if (collectionsResponse.status === 401) {
          // Handle unauthorized
          checkAuthStatus();
          throw new Error('Authentication required. Please log in again.');
        }
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
      
      setSearchPerformed(true);
      setInitialLoad(false);
      setLoading(false);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError(err.message || 'An error occurred while loading data.');
      setInitialLoad(false);
      setLoading(false);
    }
  }, [username, navigate, checkAuthStatus, fetchCollectionRecords]);
  
  // Now place useEffects after all the callbacks are defined
  
  // Verify authentication first
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        await checkAuthStatus();
        if (!isAuthenticated) {
          // Save the current path for redirect after login
          const returnUrl = encodeURIComponent(window.location.pathname);
          navigate(`/login?returnUrl=${returnUrl}`);
        }
      } catch (err) {
        console.error('Auth verification failed:', err);
        navigate('/login');
      }
    };
    
    verifyAuth();
    
    // Set up periodic auth checks
    const interval = setInterval(checkAuthStatus, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [isAuthenticated, checkAuthStatus, navigate]);
  
  // Effect to load data if username is provided in URL
  useEffect(() => {
    // Only load data if authenticated and username is available
    if (username && isAuthenticated) {
      loadUserData(username);
    }
  }, [username, isAuthenticated, loadUserData]);
  
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
              // Use server-side API endpoint for fetching records
              const url = `/api/collections/${encodeURIComponent(did)}/records?endpoint=${encodeURIComponent(serviceEndpoint)}&collection=${encodeURIComponent(collection)}&limit=25`;
              
              const response = await fetch(url, {
                credentials: 'include'
              });
              
              if (!response.ok) {
                if (response.status === 401) {
                  // Handle unauthorized
                  checkAuthStatus();
                  throw new Error('Authentication required. Please log in again.');
                }
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
    // Verify authentication before proceeding
    if (!isAuthenticated) {
      checkAuthStatus();
      return;
    }

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
          if (error.message?.includes('Authentication required')) {
            // Handle authentication errors
            const returnUrl = encodeURIComponent(window.location.pathname);
            navigate(`/login?returnUrl=${returnUrl}`);
          } else {
            setError('Failed to load more records. Please try again.');
          }
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
  
  return (
    <div className="collections-feed-container">
      <Helmet>
        <title>{username ? `${username}'s Omnifeed` : 'Omnifeed'}</title>
        <meta name="description" content={username ? `View ${username}'s AT Protocol collection records in chronological order` : 'View AT Protocol collection records in chronological order'} />
      </Helmet>
      
      {initialLoad && !username ? (
        <div className="omni-card alt-card">
          <h1>Bluesky Omnifeed</h1>
          <p>
            View and analyze any Bluesky account's AT Protocol collection records chronologically.
          </p>
          <form className="search-bar" onSubmit={(e) => {
            e.preventDefault();
            if (handle.trim() !== "") {
              loadUserData(handle.trim());
            }
          }} role="search">
            <div>
              <input
                type="text"
                placeholder="(e.g. user.bsky.social)"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                required
              />
            </div>
            <div className="action-row">
              <button className="analyze-button" type="submit">Analyze</button>
            </div>
          </form>
          
          <div className="omni-info-card">
            <h3>What is Omnifeed?</h3>
            <p>Omnifeed provides a chronological view of a user's entire ATProto repository, including all collections such as posts, likes, follows, and more. It helps you analyze account history and activity patterns.</p>
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
                onClick={() => navigate('/omnifeed')}
              >
                Try Another Account
              </button>
            </div>
          ) : searchPerformed && (
            <div className="feed-container">
              <div className="page-title">
                <h1>Omnifeed</h1>
              </div>
              <div className="user-header">
                <h1>{displayName}</h1>
                <h2>@{handle}</h2>
                {did && (
                  <div className="user-did">
                    <span>DID: {did}</span>
                    <button 
                      className="copy-button"
                      onClick={(event) => {
                        navigator.clipboard.writeText(did);
                        // Show temporary success message
                        const button = event.currentTarget;
                        button.classList.add('copied');
                        setTimeout(() => button.classList.remove('copied'), 2000);
                      }}
                      title="Copy DID"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                  </div>
                )}
                {serviceEndpoint && (
                  <div className="user-endpoint">
                    <span>Service: {serviceEndpoint}</span>
                    <button 
                      className="copy-button"
                      onClick={(event) => {
                        navigator.clipboard.writeText(serviceEndpoint);
                        // Show temporary success message
                        const button = event.currentTarget;
                        button.classList.add('copied');
                        setTimeout(() => button.classList.remove('copied'), 2000);
                      }}
                      title="Copy Service Endpoint"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              
              {/* Activity Chart */}
              <ActivityChart 
                records={filteredChartRecords} 
                collections={selectedCollections}
                loading={chartLoading}
                key={`chart-${Date.now()}-${filteredChartRecords.length}-${selectedCollections.join(',')}`} // Use timestamp in key to ensure re-render on refresh
              />
              
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
                      <div className="filter-header-top">
                        <h3>Select Collections</h3>
                        <button 
                          className="filter-close-mobile"
                          onClick={() => setDropdownOpen(false)}
                          aria-label="Close"
                        >
                          ✕
                        </button>
                      </div>
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
                  title="Refresh only the feed, not the chart"
                >
                  Refresh Feed
                </button>
              </div>
              
              <div className="feed-filters">
                <div className="toggle-container">
                  <div className="timestamp-toggle">
                    <label>
                      <input
                        type="checkbox"
                        checked={useRkeyTimestamp}
                        onChange={() => {
                          // Toggle the timestamp mode
                          const newTimestampMode = !useRkeyTimestamp;
                          setUseRkeyTimestamp(newTimestampMode);
                          
                          // Refresh the feed with the new timestamp setting
                          if (did && serviceEndpoint && selectedCollections.length > 0) {
                            // Temporarily reset records for the loading state
                            const currentRecords = [...records];
                            setRecords([]);
                            setLoading(true);
                            
                            // Use our refreshed server-side approach
                            handleRefresh()
                              .catch(err => {
                                console.error("Error refreshing with new timestamp mode:", err);
                                
                                // Restore the previous records and sort them
                                const sorted = [...currentRecords].filter(record => {
                                  if (newTimestampMode) { // We're switching to rkey timestamps
                                    return record.rkeyTimestamp !== null;
                                  } else { // We're switching to content timestamps
                                    return record.contentTimestamp !== null;
                                  }
                                }).sort((a, b) => {
                                  const aTime = newTimestampMode ? a.rkeyTimestamp : a.contentTimestamp;
                                  const bTime = newTimestampMode ? b.rkeyTimestamp : b.contentTimestamp;
                                  return new Date(bTime) - new Date(aTime);
                                });
                                setRecords(sorted);
                                setLoading(false);
                              });
                          } else {
                            // If we can't refetch, just resort the existing records
                            const sorted = [...records].filter(record => {
                              if (newTimestampMode) { // We're switching to rkey timestamps
                                return record.rkeyTimestamp !== null;
                              } else { // We're switching to content timestamps
                                return record.contentTimestamp !== null;
                              }
                            }).sort((a, b) => {
                              const aTime = newTimestampMode ? a.rkeyTimestamp : a.contentTimestamp;
                              const bTime = newTimestampMode ? b.rkeyTimestamp : b.contentTimestamp;
                              return new Date(bTime) - new Date(aTime);
                            });
                            setRecords(sorted);
                          }
                        }}
                      />
                      Use Record Key Timestamps
                    </label>
                    <span title="Record keys in AT Protocol encode creation timestamps which can differ from timestamps in the record content.">ⓘ</span>
                  </div>
                  
                  <div className="view-toggle">
                    <div className="toggle-switch-container">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={compactView}
                          onChange={() => setCompactView(!compactView)}
                        />
                        <span className="slider round"></span>
                        <span className="toggle-label">{compactView ? 'Compact View' : 'Standard View'}</span>
                      </label>
                    </div>
                  </div>
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
                    compactView={compactView}
                  />
                  
                  {filteredRecords.length === 0 && (
                    <div className="no-records-message">
                      <p>No records found for the selected collections.</p>
                    </div>
                  )}
                  
                  {filteredRecords.length > 0 && (
                    <div className="load-more-container">
                      <div className="records-count">
                        Showing {filteredRecords.length} of {filteredChartRecords.length} records
                      </div>
                      
                      {canLoadMore && (
                        <button 
                          className="load-more-button"
                          onClick={handleLoadMore}
                          disabled={fetchingMore}
                        >
                          {fetchingMore ? 'Loading...' : 'Load More Records'}
                        </button>
                      )}
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