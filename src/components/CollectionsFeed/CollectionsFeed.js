import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SearchBar from '../SearchBar/SearchBar';
import FeedTimeline from './FeedTimeline';
import ActivityChart from './ActivityChart';
import './CollectionsFeed.css'; // Renamed to Omnifeed.css but keeping same filename for compatibility
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
  
  // Effect to load data if username is provided in URL
  useEffect(() => {
    if (username) {
      loadUserData(username);
    }
  }, [username]);
  
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
  }, [selectedCollections]);
  
  // Function to load user data
  const loadUserData = async (userHandle) => {
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
      
      // Set chartLoading for initial load or when refreshing
      if (!isLoadMore || collectionsList.length > 0) {
        setChartLoading(true);
        console.log(`Setting chart loading to TRUE for ${isLoadMore ? 'refresh' : 'initial load'}`);
      }
      
      // Array to store all fetched records
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
        let totalRecordsForCollection = 0;
        
        // For initial deep load, we need to paginate as many times as needed to get all historical data
        // For regular timeline browsing or load more, we just get one page
        // Set a high limit for safety, but essentially allow unlimited pagination until we hit the cutoff date
        const maxPages = isInitialDeepLoad ? 1000 : 1; 
        
        while (hasMoreRecords && pageCount < maxPages && !reachedCutoff) {
          // Fetch up to 100 records per page
          let url = `${endpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(userDid)}&collection=${encodeURIComponent(collection)}&limit=100`;
          
          // Add cursor if we have one
          if (cursor) {
            url += `&cursor=${encodeURIComponent(cursor)}`;
          }
          
          console.log(`Fetching ${collection} page ${pageCount + 1}${cursor ? ' with cursor' : ''}`);
          
          const response = await fetch(url);
          
          if (!response.ok) {
            console.error(`Error fetching records for ${collection}: ${response.statusText}`);
            break;
          }
          
          const data = await response.json();
          pageCount++;
          
          // Process records from this page
          if (data.records && data.records.length > 0) {
            console.log(`Received ${data.records.length} records for ${collection} page ${pageCount}`);
            totalRecordsForCollection += data.records.length;
            
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
                
                // If we found some records close to the cutoff date but haven't reached it yet,
                // log this for debugging purposes
                if (oldestRecordTime < cutoffDate.getTime() + (7 * 24 * 60 * 60 * 1000)) { // within 7 days of cutoff
                  console.log(`  - Getting close to cutoff date, oldest record = ${new Date(oldestRecordTime).toISOString()}`);
                }
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
        
        console.log(`Finished fetching ${collection}: Retrieved ${totalRecordsForCollection} records in ${pageCount} pages`);
        console.log(`  - After filtering: ${collectionRecords.length} records in 90-day window`);
        if (reachedCutoff) {
          console.log(`  - Stopped because records older than 90 days were found`);
        } else if (!cursor) {
          console.log(`  - Stopped because no more records were available`);
        } else if (pageCount >= maxPages) {
          console.log(`  - Stopped because max page limit (${maxPages}) was reached`);
        }
        
        // Add records to appropriate arrays
        allChartRecords = [...allChartRecords, ...collectionRecords];
        
        // For display timeline, we might want to be more selective
        if (isLoadMore || !isInitialDeepLoad) {
          allRecords = [...allRecords, ...collectionRecords];
        } else if (isInitialDeepLoad) {
          // For initial load, we'll filter later to just show the most recent
          // This keeps allRecords separate from chart data until we're done
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
      
      // Create a summary of records per collection for debugging
      const collectionSummary = {};
      sortedChartRecords.forEach(record => {
        if (!collectionSummary[record.collection]) {
          collectionSummary[record.collection] = 0;
        }
        collectionSummary[record.collection]++;
      });
      
      console.log("Collection record counts in 90-day period:");
      Object.entries(collectionSummary)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .forEach(([collection, count]) => {
          console.log(`  - ${collection}: ${count} records`);
        });
      
      console.log(`Fetched ${sortedChartRecords.length} total records for chart, showing ${displayRecords.length} in timeline`);
      
      // In the case of a refresh, sortedChartRecords only contains fresh data for selected collections
      // We need to merge this with any existing data for other collections
      const existingRecordsToKeep = isLoadMore ? [] : allRecordsForChart.filter(record => 
        !collectionsList.includes(record.collection)
      );
      
      // Variable to hold our final merged records
      let mergedRecords;
      
      // For refresh, remove old data for the collections we just refreshed
      if (!isLoadMore) {
        console.log(`Removing old data for refreshed collections: ${collectionsList.join(', ')}`);
        
        // Count for stats
        const beforeCount = existingRecordsToKeep.length + sortedChartRecords.length;
        
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
        console.log(`Merged ${existingRecordsToKeep.length} existing records with ${uniqueNewRecords.length} new unique records`);
        console.log(`Total records: ${beforeCount} before deduplication, ${mergedRecords.length} after`);
      }
      else {
        // For load more, just add all the new records
        mergedRecords = [...existingRecordsToKeep, ...sortedChartRecords];
      }
      
      console.log(`Final chart dataset size: ${mergedRecords.length} records`);
      
      // Update state
      setRecords(displayRecords);
      setAllRecordsForChart(mergedRecords);
      setCollectionCursors(newCursors);
      setFetchingMore(false);
      
      // Always set chartLoading to false when done, regardless of initial state
      setChartLoading(false);
      console.log("Setting chart loading to FALSE");
      
    } catch (err) {
      console.error('Error fetching collection records:', err);
      setError('Failed to fetch records. Please try again.');
      setFetchingMore(false);
      setChartLoading(false); // Always reset on error
      console.log("Setting chart loading to FALSE (error case)");
    }
  };
  
  // Toggle collection selection
  const toggleCollection = (collection) => {
    if (selectedCollections.includes(collection)) {
      setSelectedCollections(prev => prev.filter(item => item !== collection));
    } else {
      setSelectedCollections(prev => [...prev, collection]);
    }
    // We don't need to manually refresh here since we added a useEffect hook
    // that watches for changes to selectedCollections
  };
  
  // Select all collections
  const selectAllCollections = () => {
    setSelectedCollections([...collections]);
    // We don't need to manually refresh here since we added a useEffect hook
    // that watches for changes to selectedCollections
  };
  
  // Deselect all collections
  const deselectAllCollections = () => {
    setSelectedCollections([]);
    // No need to refresh as we'll show "no collections selected" message
  };
  
  // Handle refresh button click
  const handleRefresh = async () => {
    if (did && serviceEndpoint) {
      console.log("Refresh requested for selected collections:", selectedCollections);
      
      // Set loading state for chart to true
      setChartLoading(true);
      
      try {
        // The fetchCollectionRecords function will handle merging the new data
        // with existing data for other collections
        await fetchCollectionRecords(did, serviceEndpoint, selectedCollections, false);
        
        console.log("Refresh completed successfully");
      } catch (err) {
        console.error("Error during refresh:", err);
        setError('Failed to refresh records. Please try again.');
      } finally {
        // Ensure loading state is reset
        setChartLoading(false);
      }
    }
  };
  
  // Handle load more button click
  const handleLoadMore = async () => {
    setFetchingMore(true);
    
    // First check if we already have more records locally that we can show
    if (hasMoreRecordsLocally) {
      console.log("Loading more records from local cache");
      // Simply increase the number of displayed records
      const currentDisplayCount = filteredRecords.length;
      const nextBatchSize = 25;
      
      // Store the new count so our filteredRecords computation shows more records
      setRecords(prev => {
        // Create a dummy array of the right length to control how many records are shown
        return Array(currentDisplayCount + nextBatchSize).fill(null);
      });
      
      setFetchingMore(false);
    } 
    // If we've displayed all local records but have cursors to fetch more from the API
    else if (hasMoreRecordsRemotely) {
      console.log("Fetching more records from API");
      // Only load more from collections that have cursors and are selected
      const collectionsToLoad = selectedCollections.filter(collection => collectionCursors[collection]);
      
      if (collectionsToLoad.length > 0) {
        await fetchCollectionRecords(did, serviceEndpoint, collectionsToLoad, true);
      } else {
        setFetchingMore(false);
      }
    } else {
      console.log("No more records to load");
      setFetchingMore(false);
    }
  };
  
  // Filter ALL chart records based on selected collections
  const filteredChartRecords = allRecordsForChart.filter(record => 
    selectedCollections.includes(record.collection)
  );

  // For timeline display, directly use the chart records but limit to most recent 25
  // This ensures we always show the most recent records for the selected collections
  // regardless of what was initially loaded in the records state
  const filteredRecords = filteredChartRecords
    .sort((a, b) => {
      // Sort by timestamp (newest first)
      const aTime = useRkeyTimestamp ? a.rkeyTimestamp : a.contentTimestamp;
      const bTime = useRkeyTimestamp ? b.rkeyTimestamp : b.contentTimestamp;
      return new Date(bTime) - new Date(aTime);
    })
    .slice(0, fetchingMore ? records.length : 25); // Show 25 records initially, more when loading more
  
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
        <div className="search-container">
          <h1>Omnifeed</h1>
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
                        // Toggle the timestamp mode
                        const newTimestampMode = !useRkeyTimestamp;
                        setUseRkeyTimestamp(newTimestampMode);
                        
                        // Refresh the feed with the new timestamp setting
                        if (did && serviceEndpoint && selectedCollections.length > 0) {
                          // We need to refetch to ensure we get all records
                          // Store the current mode for fetchCollectionRecords
                          const currentMode = useRkeyTimestamp;
                          
                          // Temporarily reset records for the loading state
                          const currentRecords = [...records];
                          setRecords([]);
                          setLoading(true);
                          
                          // Fetch new records with the current selection
                          fetchCollectionRecords(did, serviceEndpoint, selectedCollections)
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