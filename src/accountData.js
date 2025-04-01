/***********************************************************************
 * New functions to resolve handle and service endpoint
 ***********************************************************************/

// Resolve a handle (e.g., "dame.bsky.social") into a DID using the atproto resolveHandle endpoint.
export async function resolveHandleToDid(inputHandle) {
  const url = `${publicServiceEndpoint}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(inputHandle)}`;
  const data = await getJSON(url);
  if (!data.did) {
    throw new Error("Could not resolve handle to DID.");
  }
  return data.did;
}

// Get the service endpoint for the DID by querying either the PLC directory or (for did:web identities) the well-known DID document.
export async function getServiceEndpointForDid(resolvedDid) {
  let url;
  
  if (resolvedDid.startsWith("did:web:")) {
    // For did:web, remove the prefix to get the domain.
    // (Example: "did:web:example.com" → "example.com")
    const domain = resolvedDid.slice("did:web:".length);
    // Construct the URL for the well-known DID document.
    url = `https://${domain}/.well-known/did.json`;
  } else if (resolvedDid.startsWith("did:plc:")) {
    // For did:plc, use your PLC directory endpoint.
    url = `${plcDirectoryEndpoint}/${encodeURIComponent(resolvedDid)}`;
  } else {
    throw new Error(`Unsupported DID method for DID: ${resolvedDid}`);
  }

  // Fetch the DID document
  const data = await getJSON(url);
  if (!data.service || !Array.isArray(data.service)) {
    throw new Error("Could not determine service endpoint for DID.");
  }

  // Look for the service endpoint.
  // For PLC DIDs, we specifically look for the service with type "AtprotoPersonalDataServer".
  // For did:web, we try to pick that service if present, otherwise fallback to the first available entry.
  let svcEntry;
  if (resolvedDid.startsWith("did:plc:")) {
    svcEntry = data.service.find((svc) => svc.type === "AtprotoPersonalDataServer");
  } else if (resolvedDid.startsWith("did:web:")) {
    svcEntry = data.service.find((svc) => svc.type === "AtprotoPersonalDataServer") || data.service[0];
  }

  if (!svcEntry || !svcEntry.serviceEndpoint) {
    throw new Error("Could not determine service endpoint for DID.");
  }
  
  return svcEntry.serviceEndpoint;
}


/***********************************************************************
 * Global settings and basic caching
 ***********************************************************************/
let did = null;             // Will be resolved from the handle.
let handle = null;          // Will be set by the caller (from the URL/searchbar).
let serviceEndpoint = null; // Will be derived from the PLC Directory.
const plcDirectoryEndpoint = "https://plc.directory";
const publicServiceEndpoint = "https://public.api.bsky.app";

// Basic in-memory cache to avoid duplicate API calls.
const cache = {};

/***********************************************************************
 * Helper Functions
 ***********************************************************************/
async function getJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} error for ${url}`);
    }
    return await response.json();
  } catch (err) {
    console.error("Error in getJSON for", url, err);
    throw err;
  }
}

async function cachedGetJSON(url) {
  if (cache[url]) return cache[url];
  const data = await getJSON(url);
  cache[url] = data;
  return data;
}

/***********************************************************************
 * NEW: Helper Function to Send Account Data to Backend API for Scoring
 ***********************************************************************/
async function fetchScores(accountData) {
  try {
    const response = await fetch('https://api.cred.blue/api/score', { // Update URL when ready publicly
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(accountData)
    });
    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching scores:", error);
    throw error;
  }
}

/***********************************************************************
 * Utility Function to Find the First "createdAt" in a Record
 ***********************************************************************/
// This function recursively searches for the first occurrence of "createdAt" in an object.
function findFirstCreatedAt(obj) {
  if (typeof obj !== 'object' || obj === null) return null;
  if ('createdAt' in obj) return obj.createdAt;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'object' && value !== null) {
      const result = findFirstCreatedAt(value);
      if (result) return result;
    }
  }
  return null;
}

/***********************************************************************
 * Endpoint calls with pagination and caching
 ***********************************************************************/

// 1. Fetch Profile data (one-shot)
async function fetchProfile() {
  const url = `${publicServiceEndpoint}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`;
  return await cachedGetJSON(url);
}

// 2. Fetch all blobs (paginated)
async function fetchAllBlobsCount(onPage = () => {}, expectedPages = 2, cutoffTime = null) {
  let urlBase = `${serviceEndpoint}/xrpc/com.atproto.sync.listBlobs?did=${encodeURIComponent(did)}&limit=1000`;
  let count = 0, cursor = null;
  do {
    const url = urlBase + (cursor ? `&cursor=${cursor}` : "");
    let data;
    try {
      data = await cachedGetJSON(url);
    } catch (err) {
      console.error("Error fetching blobs:", err);
      break;
    }
    if (Array.isArray(data.cids)) {
      for (const cid of data.cids) {
        if (data.blobs && data.blobs[cid]) {
          const blob = data.blobs[cid];
          const createdAt = findFirstCreatedAt(blob);
          if (cutoffTime) {
            if (createdAt) {
              const recordTime = new Date(createdAt).getTime();
              if (recordTime >= cutoffTime) {
                count += 1;
              }
            } else {
              // No 'createdAt', include it
              count += 1;
            }
          } else {
            count += 1;
          }
        } else {
          // If blob details aren't available, count it by default
          count += 1;
        }
      }
    }
    // Wait a tick before next page
    await new Promise((resolve) => setTimeout(resolve, 0));
    cursor = data.cursor || null;
  } while (cursor);
  return count;
}

// 3. Fetch repo description (one-shot)
async function fetchRepoDescription() {
  const url = `${serviceEndpoint}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`;
  return await cachedGetJSON(url);
}

async function fetchRecordsForCollection(
  collectionName,
  onPage = () => {},
  expectedPages = 50,
  // Default cutoff: 90 days ago in ms
  cutoffTime = Date.now() - 90 * 24 * 60 * 60 * 1000
) {
  console.log(`\n=== fetchRecordsForCollection: ${collectionName} (cutoff=${new Date(cutoffTime).toISOString()}) ===`);
  const urlBase = `${serviceEndpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(
    did
  )}&collection=${encodeURIComponent(collectionName)}&limit=100`;

  let records = [];
  let cursor = null;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const url = cursor ? `${urlBase}&cursor=${cursor}` : urlBase;
    console.log(`Fetching page #${pageCount} for ${collectionName} with URL:`, url);

    let data;
    try {
      data = await cachedGetJSON(url);
    } catch (err) {
      console.error("Error fetching records for collection:", collectionName, err);
      break;
    }

    if (!data || !Array.isArray(data.records) || data.records.length === 0) {
      console.log(`No more records returned for ${collectionName}; stopping.`);
      break; // no more data
    }

    let minCreatedAt = Infinity;
    const pageRecords = [];

    // 1) Inspect each record in the current page
    for (const rec of data.records) {
      // Attempt to find createdAt
      let createdAt;
      if (collectionName === "app.bsky.feed.post" && rec.value?.createdAt) {
        createdAt = rec.value.createdAt;
      } else {
        createdAt = findFirstCreatedAt(rec);
      }

      // 2) Convert to ms, or fallback to a "current" time for missing createdAt
      let recordTime;
      if (!createdAt) {
        recordTime = Date.now(); // If missing, you could treat it as "include always"
        console.log(
          `Record with no createdAt => using "now" to compare. URI: ${rec.uri}`
        );
      } else {
        recordTime = new Date(createdAt).getTime();
      }

      // 4) Track minimum createdAt in this page
      minCreatedAt = Math.min(minCreatedAt, recordTime);

      // 5) We'll decide to include this record only if it's >= cutoffTime
      if (recordTime >= cutoffTime) {
        pageRecords.push(rec);
      }
    }

    // 6) After analyzing all records in the page, if the earliest record is older than cutoff => no more pages
    if (minCreatedAt < cutoffTime) {
      console.log(
        `Found an older record in this page (minCreatedAt=${new Date(
          minCreatedAt
        ).toISOString()}); not fetching further pages.`
      );
      // We still add the records that were >= cutoffTime from this page
      records.push(...pageRecords);
      break;
    }

    // 7) If all records in this page are >= cutoffTime, add them all
    records.push(...pageRecords);

    // 8) If there's no cursor => done
    if (!data.cursor) {
      console.log(`No cursor in response; done fetching for ${collectionName}.`);
      break;
    } else {
      // Move to next page
      cursor = data.cursor;
    }

    // Optional: If we want to avoid infinite loops
    if (pageCount >= expectedPages) {
      console.log(`Reached expectedPages (${expectedPages}) for ${collectionName}; stopping.`);
      break;
    }
  }

  console.log(
    `Finished fetchRecordsForCollection(${collectionName}), got total = ${records.length} records`
  );
  return records;
}



// 5. Fetch audit log from PLC Directory (one-shot)
async function fetchAuditLog() {
  const url = `${plcDirectoryEndpoint}/${encodeURIComponent(did)}/log/audit`;
  return await cachedGetJSON(url);
}

async function fetchAuthorFeed(
  onPage = () => {},
  expectedPages = 10,
  cutoffTime = Date.now() - 90 * 24 * 60 * 60 * 1000
) {
  console.log(`\n=== fetchAuthorFeed (cutoff=${new Date(cutoffTime).toISOString()}) ===`);
  const urlBase = `${publicServiceEndpoint}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(
    did
  )}&limit=100`;

  let feed = [];
  let cursor = null;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const url = cursor ? `${urlBase}&cursor=${cursor}` : urlBase;
    console.log(`Fetching page #${pageCount} with URL:`, url);

    let data;
    try {
      data = await cachedGetJSON(url);
    } catch (err) {
      console.error("Error fetching author feed:", err);
      break;
    }

    if (!data || !Array.isArray(data.feed) || data.feed.length === 0) {
      console.log("No more feed items returned; stopping.");
      break;
    }

    let minCreatedAt = Infinity;
    const pageItems = [];

    for (const item of data.feed) {
      // Only look at the main post's createdAt, not any nested reply data
      let createdAt = item.post?.record?.createdAt;
      
      let itemTime;
      if (!createdAt) {
        itemTime = Date.now();
        console.log(
          `Feed item with no createdAt => using now. Post URI: ${item.post?.uri}`
        );
      } else {
        itemTime = new Date(createdAt).getTime();
      }

      console.log(
        `Feed item with createdAt=${createdAt}, itemTime=${itemTime}, cutoffTime=${cutoffTime}, URI=${item.post?.uri}`
      );
      
      minCreatedAt = Math.min(minCreatedAt, itemTime);

      if (itemTime >= cutoffTime) {
        pageItems.push(item);
      }
    }

    if (minCreatedAt < cutoffTime) {
      console.log(
        `Encountered a main post older than cutoff in this page (minCreatedAt=${new Date(
          minCreatedAt
        ).toISOString()}). Stopping further pagination.`
      );
      feed.push(...pageItems);
      break;
    }

    feed.push(...pageItems);

    if (!data.cursor) {
      console.log(`No cursor in response; done fetching feed.`);
      break;
    } else {
      cursor = data.cursor;
    }

    if (pageCount >= expectedPages) {
      console.log(`Hit expectedPages=${expectedPages}; stopping feed fetch.`);
      break;
    }
  }

  console.log(`Finished fetchAuthorFeed. Got total = ${feed.length} items.`);
  return feed;
}


/***********************************************************************
 * Calculation Functions
 ***********************************************************************/
function roundToTwo(num) {
  return Number(num.toFixed(2));
}

function roundNumbers(obj) {
  if (Array.isArray(obj)) {
    return obj.map(roundNumbers);
  } else if (typeof obj === "object" && obj !== null) {
    const newObj = {};
    for (let key in obj) {
      newObj[key] = roundNumbers(obj[key]);
    }
    return newObj;
  } else if (typeof obj === "number") {
    return roundToTwo(obj);
  } else {
    return obj;
  }
}

function calculateAge(createdAt) {
  const created = new Date(createdAt);
  const today = new Date();
  const diffTime = Math.abs(today - created);
  const ageInDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const refDate = new Date("2022-11-17T00:35:16.391Z");
  const daysSinceRef = Math.floor(Math.abs(today - refDate) / (1000 * 60 * 60 * 24));
  const agePercentage = daysSinceRef > 0 ? ageInDays / daysSinceRef : 0;
  return { ageInDays, agePercentage };
}

function calculatePostingStyle(stats) {
  const {
    onlyPostsPerDay = 0,
    replyOtherPercentage = 0,
    textPercentage = 0,
    imagePercentage = 0,
    videoPercentage = 0,
    linkPercentage = 0,
    altTextPercentage = 0,
    postsPerDay = 0,
  } = stats;

  // Check for lurker first
  if (postsPerDay < 0.1 && stats.totalBskyRecordsPerDay > 0.3) {
    return "Lurker";
  }

  // If posting regularly (removed engagement check)
  if (onlyPostsPerDay > 0.8) {
    if (textPercentage > linkPercentage && textPercentage > imagePercentage && textPercentage > videoPercentage) {
      return "Text Poster";
    }
    if (imagePercentage > linkPercentage && imagePercentage > textPercentage && imagePercentage > videoPercentage) {
      return altTextPercentage <= 0.3 ? "Image Poster whose working on using alt text" : "Image Poster";
    }
    if (linkPercentage > imagePercentage && linkPercentage > textPercentage && linkPercentage > videoPercentage) {
      return "Link Poster";
    }
    if (videoPercentage > imagePercentage && videoPercentage > textPercentage && videoPercentage > linkPercentage) {
      return "Video Poster";
    }
    return "Mixed Content Poster";
  }

  // Special interaction types
  if (replyOtherPercentage >= 0.5) return "Reply Guy";
  if (stats.quoteOtherPercentage >= 0.5) return "Quote Guy";
  if (stats.repostOtherPercentage >= 0.5) return "Repost Guy";
  
  return "Unknown";
}

// 1. First, add this new function to calculate engagement rate
function calculateEngagementMetrics(engagementsReceived = {}, onlyPosts = 0, followersCount = 0) {
  // Ensure we have valid numbers, defaulting to 0 if undefined
  const totalEngagements = (
    (engagementsReceived?.likesReceived || 0) +
    (engagementsReceived?.repostsReceived || 0) +
    (engagementsReceived?.quotesReceived || 0) +
    (engagementsReceived?.repliesReceived || 0)
  );

  const safePostsCount = Number(onlyPosts) || 0;
  const safeFollowersCount = Number(followersCount) || 0;

  return {
    totalEngagements: roundToTwo(totalEngagements),
    engagementsPerPost: safePostsCount > 0 ? roundToTwo(totalEngagements / safePostsCount) : 0,
    engagementRate: (safePostsCount > 0 && safeFollowersCount > 0) 
      ? roundToTwo((totalEngagements / (safePostsCount * safeFollowersCount)) * 100)
      : 0
  };
}

function calculateSocialStatus({ ageInDays = 0, followersCount = 0, followsCount = 0, engagementRate = 0 }) {
  // Define the minimum engagement rate threshold for advancing to higher tiers
  const MIN_ENGAGEMENT_RATE = 0.01; // 1%
  
  // Check for Newcomer first (less than 30 days old)
  if (ageInDays < 30) {
    return "Newcomer";
  }
  
  // Default status for accounts older than 30 days
  let status = "Explorer";
  
  // Check follower counts and engagement rate for higher tiers
  if (followersCount >= 100000) {
    if (engagementRate >= MIN_ENGAGEMENT_RATE) {
      status = "Leader";
    } else {
      // Fallback to Guide if engagement requirement not met
      status = "Guide";
    }
  } else if (followersCount >= 10000) {
    if (engagementRate >= MIN_ENGAGEMENT_RATE) {
      status = "Guide";
    } else {
      // Fallback to Pathfinder if engagement requirement not met
      status = "Pathfinder";
    }
  } else if (followersCount >= 1000) {
    if (engagementRate >= MIN_ENGAGEMENT_RATE) {
      status = "Pathfinder";
    }
    // Fallback to Explorer if engagement requirement not met
  }
  
  // Add engagement qualifier based on rate
  if (engagementRate > 0.03) { // 3%
    return `Highly Engaging ${status}`;
  } else if (engagementRate > 0.01) { // 1%
    return `Engaging ${status}`;
  }
  
  // Return base status
  return status;
}

function calculateActivityStatus(rate) {
  if (rate === 0) return "inactive";
  if (rate > 0 && rate < 10) return "barely active";
  if (rate >= 10 && rate < 25) return "active";
  if (rate >= 25 && rate < 100) return "very active";
  if (rate >= 100) return "extremely active";
}

function calculateProfileCompletion(profile) {
  const hasDisplayName = Boolean(profile.displayName && profile.displayName.trim());
  const hasBanner = Boolean(profile.banner && profile.banner.trim());
  const hasDescription = Boolean(profile.description && profile.description.trim());
  if (hasDisplayName && hasBanner && hasDescription) return "complete";
  if (hasDisplayName || hasBanner || hasDescription) return "incomplete";
  return "not started";
}

function calculateDomainRarity(handle) {
  if (handle.includes("bsky.social")) {
    const len = handle.length;
    if (len >= 21) return "very common";
    if (len >= 18 && len <= 20) return "common";
    if (len === 17) return "uncommon";
    if (len === 16) return "rare";
    if (len === 15) return "very rare";
    if (len <= 14) return "extremely rare";
  } else {
    const standardTLDs = [".com", ".org", ".net"];
    const hasStandardTLD = standardTLDs.some((tld) => handle.endsWith(tld));
    let len;
    if (hasStandardTLD) {
      const parts = handle.split(".");
      const domainName = parts[0]; // Take just the domain name part before the TLD
      len = domainName.length;
      if (len >= 15) return "very common";
      if (len >= 12 && len <= 14) return "common";
      if (len >= 9 && len <= 11) return "uncommon";
      if (len >= 7 && len <= 8) return "rare";
      if (len === 6) return "very rare";
      if (len <= 5) return "extremely rare";
    } else {
      len = handle.length;
      if (len >= 14) return "very common";
      if (len >= 11 && len <= 13) return "common";
      if (len >= 8 && len <= 10) return "uncommon";
      if (len >= 6 && len <= 7) return "rare";
      if (len === 5) return "very rare";
      if (len <= 4) return "extremely rare";
    }
  }
  return "unknown";
}

function calculateEra(createdAt) {
  const created = new Date(createdAt);
  if (created >= new Date("2022-11-16") && created <= new Date("2023-01-31")) {
    return "Pre-history";
  } else if (created >= new Date("2023-02-01") && created <= new Date("2024-01-31")) {
    return "Invite-only";
  } else if (created > new Date("2024-01-31")) {
    return "Public release";
  }
  return "Unknown";
}

/***********************************************************************
 * Main Function – Build accountData90Days and accountData30Days JSON objects.
 ***********************************************************************/
export async function loadAccountData(inputHandle, onProgress = () => {}) {
  try {
    // Validate input handle
    if (!inputHandle) throw new Error("Handle is not provided");
    handle = inputHandle;

    // Resolve handle to DID and get service endpoint
    did = await resolveHandleToDid(handle);
    serviceEndpoint = await getServiceEndpointForDid(did);

    // Fetch profile
    const profile = await fetchProfile();

    // Calculate age
    const { ageInDays, agePercentage } = calculateAge(profile.createdAt);

    // Fetch blobs (all-time)
    const cutoffTimeAll = null; // No cutoff for all-time data
    const blobsCountAll = await fetchAllBlobsCount(() => {}, 10, cutoffTimeAll);

    // Fetch repo description
    const repoDescription = await fetchRepoDescription();
    let collections = repoDescription.collections || [];
    const totalCollections = collections.length;
    const bskyCollectionNames = collections.filter((col) => col.startsWith("app.bsky"));
    const totalBskyCollections = bskyCollectionNames.length;
    const totalNonBskyCollections = totalCollections - totalBskyCollections;

    // Build targetCollections array
    const targetCollections = [...new Set(collections)];

    // Parse audit log (or use defaults for did:web identities)
    let plcOperations;
    let totalAkas, totalBskyAkas, totalCustomAkas, rotationKeysRounded, activeAkasRounded;

    if (did.startsWith("did:web:")) {
      // For did:web identities, skip fetching the audit log and use default values
      totalAkas = 1;
      totalBskyAkas = 0;
      totalCustomAkas = 1;
      rotationKeysRounded = 3;
      activeAkasRounded = 1;
      plcOperations = 0;
    } else {
      // For did:plc identities, fetch and process the audit log as usual
      const rawAuditData = await fetchAuditLog();
      let auditRecords = Array.isArray(rawAuditData)
        ? rawAuditData
        : Object.values(rawAuditData);
      plcOperations = auditRecords.length;
      let rotationKeys = 0;
      let activeAkas = 0;
      let akaSet = new Set();
      
      if (plcOperations > 0) {
        auditRecords.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const latestRecord = auditRecords[auditRecords.length - 1];
        if (latestRecord.operation && Array.isArray(latestRecord.operation.rotationKeys)) {
          rotationKeys = latestRecord.operation.rotationKeys.length;
        }
        if (latestRecord.operation && Array.isArray(latestRecord.operation.alsoKnownAs)) {
          activeAkas = latestRecord.operation.alsoKnownAs.length;
        }
        auditRecords.forEach((record) => {
          if (record.operation && Array.isArray(record.operation.alsoKnownAs)) {
            record.operation.alsoKnownAs.forEach((alias) => {
              akaSet.add(alias);
            });
          }
        });
      }
      totalAkas = akaSet.size;
      totalBskyAkas = Array.from(akaSet).filter((alias) =>
        alias.includes("bsky.social")
      ).length;
      totalCustomAkas = roundToTwo(totalAkas - totalBskyAkas);
      rotationKeysRounded = roundToTwo(rotationKeys);
      activeAkasRounded = roundToTwo(activeAkas);
    }

    // Define periods for 30 and 90 days
    const periods = [
      { days: 30, label: "30Days" },
      { days: 90, label: "90Days" },
    ];

    // Initialize objects to hold data for each period
    const accountDataPerPeriod = {};

    for (const period of periods) {
      const { days, label } = period;
      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    
      // Aggregate record counts for the period
      const { totalRecords, totalBskyRecords, totalNonBskyRecords, collectionStats, weeklyActivity } =
      await calculateRecordsAggregate(targetCollections, days, cutoffTime);
      const totalRecordsPerDay = days ? totalRecords / days : 0;
      const totalBskyRecordsPerDay = days ? totalBskyRecords / days : 0;
      const totalNonBskyRecordsPerDay = days ? totalNonBskyRecords / days : 0;
    
      // Fetch posts and reposts for the period and merge them
      const postsRecordsPosts = await fetchRecordsForCollection(
        "app.bsky.feed.post",
        () => {},
        20,
        cutoffTime
      );
      const postsRecordsReposts = await fetchRecordsForCollection(
        "app.bsky.feed.repost",
        () => {},
        20,
        cutoffTime
      );
      const postsRecords = postsRecordsPosts.concat(postsRecordsReposts);
    
      const postsCount = postsRecords.length;
      const postStats = computePostStats(postsRecords, days);
    
      // Compute engagements for the period and merge with postStats
      // First, calculate engagements
      const engagements = await calculateEngagements(cutoffTime);

      // Create complete post stats
      const completePostStats = {
        ...postStats,
        likesReceived: engagements.likesReceived,
        repostsReceived: engagements.repostsReceived,
        quotesReceived: engagements.quotesReceived,
        repliesReceived: engagements.repliesReceived,
        engagementsReceived: {
          likesReceived: engagements.likesReceived,
          repostsReceived: engagements.repostsReceived,
          quotesReceived: engagements.quotesReceived,
          repliesReceived: engagements.repliesReceived,
        }
      };
    
      // Compute activity statuses for the period
      const activityStatus = calculateActivityStatus(totalRecordsPerDay);
      const bskyActivityStatus = calculateActivityStatus(totalBskyRecordsPerDay);
      const atprotoActivityStatus = calculateActivityStatus(totalNonBskyRecordsPerDay);
    
      // Compute posting style for the period
      const postingStyle = calculatePostingStyle({
        ...completePostStats,  // Use complete stats here
        totalBskyRecordsPerDay,
      });

      const engagementMetrics = calculateEngagementMetrics(
        completePostStats?.engagementsReceived || {},
        postsCount || 0,
        profile?.followersCount || 0
      );
    
      const socialStatus = calculateSocialStatus({
        ageInDays: ageInDays || 0,
        followersCount: profile?.followersCount || 0,
        followsCount: profile?.followsCount || 0,
        engagementRate: engagementMetrics?.engagementRate || 0
      });
    
      // Build analysis narrative for the period
      const narrative = buildAnalysisNarrative({
        profile,
        activityAll: {
          activityStatus,
          bskyActivityStatus,
          atprotoActivityStatus,
          totalCollections: roundToTwo(totalCollections),
          totalBskyCollections: roundToTwo(totalBskyCollections),
          totalNonBskyCollections: roundToTwo(totalNonBskyCollections),
          totalRecords: roundToTwo(totalRecords),
          totalRecordsPerDay: roundToTwo(totalRecordsPerDay),
          totalBskyRecords: roundToTwo(totalBskyRecords),
          totalBskyRecordsPerDay: roundToTwo(totalBskyRecordsPerDay),
          totalBskyRecordsPercentage: totalRecords ? roundToTwo(totalBskyRecords / totalRecords) : 0,
          totalNonBskyRecords: roundToTwo(totalNonBskyRecords),
          totalNonBskyRecordsPerDay: roundToTwo(totalNonBskyRecords / days),
          plcOperations: roundToTwo(plcOperations),
          ...collectionStats,
          "app.bsky.feed.post": completePostStats,  // Use complete stats here
          blobsCount: roundToTwo(blobsCountAll),
          blobsPerDay: ageInDays ? roundToTwo(blobsCountAll / ageInDays) : 0,
          blobsPerPost: postsCount ? roundToTwo(blobsCountAll / postsCount) : 0,
          blobsPerImagePost: completePostStats.postsWithImages ? roundToTwo(blobsCountAll / completePostStats.postsWithImages) : 0,
        },
        postingStyle,
        socialStatus,
        rotationKeys: rotationKeysRounded,
        engagementMetrics, // Make sure this is passed
        alsoKnownAs: {
          totalAkas: roundToTwo(totalAkas),
          totalCustomAkas: roundToTwo(totalCustomAkas),
          totalBskyAkas: roundToTwo(totalBskyAkas),
        },
      });
    
      // Build the account data object for this period.
      let periodData = {
        // Keep all the basic profile info
        profile: {
          ...profile,
          did: profile.did || did,
        },
        displayName: profile.displayName,
        handle: profile.handle,
        did: profile.did || did,
        profileEditedDate: profile.indexedAt,
        profileCompletion: calculateProfileCompletion(profile),
        
        // Maintain the activityAll structure for backward compatibility
        activityAll: {
          activityStatus,
          bskyActivityStatus,
          atprotoActivityStatus,
          totalCollections: roundToTwo(totalCollections),
          totalBskyCollections: roundToTwo(totalBskyCollections),
          totalNonBskyCollections: roundToTwo(totalNonBskyCollections),
          totalRecords: roundToTwo(totalRecords),
          totalRecordsPerDay: roundToTwo(totalRecordsPerDay),
          totalBskyRecords: roundToTwo(totalBskyRecords),
          totalBskyRecordsPerDay: roundToTwo(totalBskyRecordsPerDay),
          totalBskyRecordsPercentage: totalRecords ? roundToTwo(totalBskyRecords / totalRecords) : 0,
          totalNonBskyRecords: roundToTwo(totalNonBskyRecords),
          totalNonBskyRecordsPerDay: roundToTwo(totalNonBskyRecords / days),
          totalNonBskyRecordsPercentage: totalRecords ? roundToTwo(totalNonBskyRecords / totalRecords) : 0,
          plcOperations: roundToTwo(plcOperations),
          ...collectionStats,
          "app.bsky.feed.post": completePostStats,
          blobsCount: roundToTwo(blobsCountAll),
          blobsPerDay: ageInDays ? roundToTwo(blobsCountAll / ageInDays) : 0,
          blobsPerPost: postsCount ? roundToTwo(blobsCountAll / postsCount) : 0,
          blobsPerImagePost: completePostStats.postsWithImages ? roundToTwo(blobsCountAll / completePostStats.postsWithImages) : 0,
        },
      
        // Add new categorical structure
        blueskyCategories: {
          profileQuality: {
            profileCompleteness: {
              avatar: profile.avatar ? true : false,
              banner: profile.banner ? true : false,
              description: profile.description ? true : false,
              pinnedPost: profile.pinnedPost ? true : false
            },
            altTextConsistency: completePostStats.altTextPercentage || 0,
            customDomain: !profile.handle.includes("bsky.social"),
            score: 0,
          },
          communityEngagement: {
            socialGraph: {
              followersCount: profile.followersCount,
              followsCount: profile.followsCount,
              followRatio: profile.followersCount ? (profile.followsCount / profile.followersCount) : 0
            },
            engagement: {
              ...engagementMetrics,
              replyRate: completePostStats.replyOtherPercentage || 0
            },
            score: 0,
          },
          contentActivity: {
            posts: {
              totalBskyRecords: totalBskyRecords,
              postsPerDay: totalBskyRecordsPerDay,
              collections: totalBskyCollections
            },
            contentQuality: {
              labels: profile.labels || [],
              postStats: completePostStats
            },
            score: 0,
          },
          recognitionStatus: {
            accountAge: {
              ageInDays: ageInDays,
              agePercentage: agePercentage,
              era: calculateEra(profile.createdAt)
            },
            status: {
              socialStatus: socialStatus,
              postingStyle: postingStyle
            },
            score: 0,
          }
        },
        
        atprotoCategories: {
          decentralization: {
            pds: {
              serviceEndpoint,
              isThirdParty: !serviceEndpoint.includes("bsky.network"),
              pdsType: serviceEndpoint.includes("bsky.network") ? "Bluesky" : "Third-party"
            },
            identity: {
              did: profile.did || did,
              isDidWeb: (profile.did || did).startsWith("did:web"),
              rotationKeys: rotationKeysRounded,
              customDomain: !profile.handle.includes("bsky.social")
            },
            score: 0,
          },
          protocolActivity: {
            collections: {
              totalNonBskyCollections,
              totalNonBskyRecords,
              recordsPerDay: totalNonBskyRecordsPerDay
            },
            score: 0,
          },
          accountMaturity: {
            age: {
              ageInDays,
              agePercentage,
              createdAt: profile.createdAt
            },
            plcOperations: plcOperations,
            score: 0,
          }
        },
      
        // Keep other necessary metadata fields
        serviceEndpoint,
        pdsType: serviceEndpoint.includes("bsky.network") ? "Bluesky" : "Third-party",
        createdAt: profile.createdAt,
        ageInDays: roundToTwo(ageInDays),
        agePercentage: roundToTwo(agePercentage),
        followersCount: roundToTwo(profile.followersCount),
        followsCount: roundToTwo(profile.followsCount),
        postsCount: roundToTwo(postsCount),
        rotationKeys: rotationKeysRounded,
        era: calculateEra(profile.createdAt),
        postingStyle,
        socialStatus,
        engagementMetrics,
        weeklyActivity,
        analysis: {
          narrative: {
            narrative1: narrative.narrative1,
            narrative2: narrative.narrative2,
            narrative3: narrative.narrative3,
          }
        }
      };

      // Send the account data object to the backend scoring API
      periodData = await fetchScores(periodData);
      accountDataPerPeriod[`accountData${label}`] = periodData;
    }

    // Build final output JSON.
    const finalOutput = {
      message: "accountData retrieved successfully",
      accountData90Days: accountDataPerPeriod.accountData90Days,
      accountData30Days: accountDataPerPeriod.accountData30Days,
    };

    return roundNumbers(finalOutput);
  } catch (err) {
    console.error("Error loading account data:", err);
    return {
      message: "Error retrieving accountData",
      error: err.toString(),
    };
  }
}

/***********************************************************************
 * Additional Helper Functions (if any)
 ***********************************************************************/

// Build the analysis narrative paragraphs.
function buildAnalysisNarrative(accountData) {
  const { profile, activityAll, alsoKnownAs, engagementMetrics = {} } = accountData;
  const { agePercentage } = calculateAge(profile.createdAt);
  let accountAgeStatement = "";
  if (agePercentage >= 0.97) {
      accountAgeStatement = "since the very beginning and is";
  } else if (agePercentage >= 0.7) {
      accountAgeStatement = "for a very long time and is";
  } else if (agePercentage >= 0.5) {
      accountAgeStatement = "for a long time and is";
  } else if (agePercentage >= 0.1) {
      accountAgeStatement = "for awhile and is";
  } else if (agePercentage >= 0.02) {
      accountAgeStatement = "for only a short period of time and is";
  } else {
      accountAgeStatement = "for barely any time at all";
  }

  const totalBskyCollections = activityAll.totalBskyCollections || 0;
  let blueskyFeatures = "";
  if (totalBskyCollections >= 12) {
      blueskyFeatures = "they are using all of Bluesky's core features";
  } else if (totalBskyCollections >= 8) {
      blueskyFeatures = "they are using most of Bluesky’s core features";
  } else if (totalBskyCollections >= 3) {
      blueskyFeatures = "they are using some of Bluesky’s core features";
  } else {
      blueskyFeatures = "they haven't used any of Bluesky's core features yet";
  }

  const totalNonBskyCollections = activityAll.totalNonBskyCollections || 0;
  const totalNonBskyRecords = activityAll.totalNonBskyRecords || 0;
  let atprotoEngagement = "";
  if (totalNonBskyCollections >= 10 && totalNonBskyRecords > 100) {
      atprotoEngagement = "is extremely engaged, having used many different services or tools";
  } else if (totalNonBskyCollections >= 5 && totalNonBskyRecords > 50) {
      atprotoEngagement = "is very engaged, having used many different services or tools";
  } else if (totalNonBskyCollections > 0 && totalNonBskyRecords > 5) {
      atprotoEngagement = "has dipped their toes in the water, but has yet to go deeper";
  } else {
      atprotoEngagement = "has not yet explored what's out there";
  }

  let domainHistoryStatement = "";
  if (alsoKnownAs.totalCustomAkas > 0 && profile.handle.includes("bsky.social")) {
      domainHistoryStatement = "They've used a custom domain name at some point but are currently using a default Bluesky handle";
  } else if (!profile.handle.includes("bsky.social")) {
      domainHistoryStatement = "They currently are using a custom domain";
  } else if (alsoKnownAs.totalAkas > 2 && !profile.handle.includes("bsky.social")) {
      domainHistoryStatement = "They have a custom domain set and have a history of using different aliases";
  } else {
      domainHistoryStatement = "They still have a default Bluesky handle";
  }

  // Debug logging to see what values we're working with
  console.log('Root rotationKeys:', accountData.rotationKeys);
  console.log('Nested rotationKeys:', accountData.atprotoCategories?.decentralization?.identity?.rotationKeys);
  
  const rotationKeyCount = accountData.rotationKeys || 0;
  console.log('Final rotationKeyCount used:', rotationKeyCount);
  
  let rotationKeyStatement = (rotationKeyCount === 1 || rotationKeyCount >= 3)
      ? "They have their own rotation key set" 
      : "They don't have their own rotation key set";
  
  console.log('Generated statement:', rotationKeyStatement);

  let pdsHostStatement = serviceEndpoint.includes("bsky.network")
      ? "their PDS is hosted by a Bluesky mushroom"
      : "their PDS is hosted by either a third-party or themselves";

  // First Paragraph
  const narrative1 =
      `${profile.displayName} has been on the network ${accountAgeStatement} ${calculateActivityStatus(activityAll.totalRecordsPerDay)}. ` +
      `Their profile is ${calculateProfileCompletion(profile)}, and ${blueskyFeatures}. ` +
      `When it comes to the broader ATProto ecosystem, this identity ${atprotoEngagement}.`;

  // Second Paragraph
  const narrative2 =
      `${domainHistoryStatement} which has a rarity level of ${calculateDomainRarity(profile.handle)}. ` +
      `${rotationKeyStatement}, and ${pdsHostStatement}.`;

      const era = calculateEra(profile.createdAt);
      const postingStyle = accountData.postingStyle || "Unknown";
      const socialStatus = accountData.socialStatus || "Community Member";
      
      // Safely access engagement metrics with defaults
      const {
        engagementRate = 0,
        engagementsPerPost = 0
      } = engagementMetrics;
      
      let engagementPhrase = "";
      if (engagementRate > 0.03) {
        engagementPhrase = "with exceptionally high engagement";
      } else if (engagementRate > 0.01) {
        engagementPhrase = "with very high engagement";
      } else if (engagementRate > 0.005) {
        engagementPhrase = "with high engagement";
      } else {
        engagementPhrase = "with normal engagement";
      }
    
      const narrative3 =
        `${profile.displayName || "This user"} first joined Bluesky during the ${era} era. ` +
        `Their style of posting is "${postingStyle}". ` +
        `They are a "${socialStatus}" ${engagementPhrase}, ` +
        `averaging ${engagementsPerPost.toFixed(1)} engagements per post ` +
        `across their follower base of ${profile.followersCount || 0}.`;
    
      return { narrative1, narrative2, narrative3 };
}

/***********************************************************************
 * Function to calculate aggregate records for the account by iterating over each collection.
 ***********************************************************************/
async function calculateRecordsAggregate(collectionNames, periodDays, cutoffTime) {
  let totalRecords = 0;
  let totalBskyRecords = 0;
  let totalNonBskyRecords = 0;
  const collectionStats = {};
  
  // Initialize weekly data structure
  const weeklyData = Array.from({ length: Math.ceil(periodDays / 7) }, (_, index) => ({
    weekNumber: index,
    bskyRecords: 0,
    nonBskyRecords: 0
  }));

  const getWeekNumber = (date) => {
    const recordDate = new Date(date);
    const cutoff = new Date(cutoffTime);
    const diffTime = Math.abs(recordDate - cutoff);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7);
  };

  for (const col of collectionNames) {
    const recs = await fetchRecordsForCollection(col, () => {}, 50, cutoffTime);
    const count = recs.length;
    const perDay = periodDays ? count / periodDays : 0;
    
    // Process each record for weekly stats
    for (const record of recs) {
      const createdAt = record.value?.createdAt || findFirstCreatedAt(record);
      if (createdAt) {
        const weekNum = getWeekNumber(createdAt);
        if (weekNum >= 0 && weekNum < weeklyData.length) {
          if (col.startsWith("app.bsky")) {
            weeklyData[weekNum].bskyRecords++;
          } else {
            weeklyData[weekNum].nonBskyRecords++;
          }
        }
      }
    }

    collectionStats[col] = {
      count: roundToTwo(count),
      perDay: roundToTwo(perDay),
    };
    
    totalRecords += count;
    if (col.startsWith("app.bsky")) {
      totalBskyRecords += count;
    } else {
      totalNonBskyRecords += count;
    }
  }

  return {
    totalRecords,
    totalBskyRecords,
    totalNonBskyRecords,
    collectionStats,
    weeklyActivity: weeklyData
  };
}

/***********************************************************************
 * Function to calculate engagements for the account using the author feed.
 ***********************************************************************/
async function calculateEngagements(cutoffTime = null) {
  console.log("Starting engagement calculation");
  const feed = await fetchAuthorFeed(() => {}, 15, cutoffTime);
  
  let likesReceived = 0;
  let repostsReceived = 0;
  let quotesReceived = 0;
  let repliesReceived = 0;

  for (const item of feed) {
    // Only consider posts from this author
    if (item && item.post && item.post.author && item.post.author.did === did) {
      // Only add the direct post metrics, ignoring any nested metrics
      if (item.post.likeCount !== undefined) likesReceived += item.post.likeCount;
      if (item.post.repostCount !== undefined) repostsReceived += item.post.repostCount;
      if (item.post.quoteCount !== undefined) quotesReceived += item.post.quoteCount;
      if (item.post.replyCount !== undefined) repliesReceived += item.post.replyCount;
    }
  }

  const results = {
    likesReceived: roundToTwo(likesReceived),
    repostsReceived: roundToTwo(repostsReceived),
    quotesReceived: roundToTwo(quotesReceived),
    repliesReceived: roundToTwo(repliesReceived),
  };

  return results;
}

/***********************************************************************
 * Function to compute post statistics based on records and period
 ***********************************************************************/
function computePostStats(postsRecords, periodDays) {
  function filterRecords(records, testFunc) {
    return records.filter(testFunc).length;
  }

  const postsCount = postsRecords.length;
  const onlyPosts = filterRecords(postsRecords, (rec) => !rec.value.hasOwnProperty("reply"));
  const onlyReplies = filterRecords(postsRecords, (rec) => rec.value.hasOwnProperty("reply"));
  const onlyRepliesToSelf = postsRecords.filter((rec) => {
    if (!rec.value || !rec.value.reply || !rec.value.reply.parent) return false;
    return rec.value.reply.parent.uri.includes(did);
  }).length;
  const onlyRepliesToOthers = onlyReplies - onlyRepliesToSelf;
  const onlyQuotes = filterRecords(
    postsRecords,
    (rec) =>
      rec.value.embed && rec.value.embed["$type"] === "app.bsky.embed.record"
  );
  const onlySelfQuotes = filterRecords(postsRecords, (rec) => {
    if (
      !rec.value ||
      !rec.value.embed ||
      (rec.value.embed["$type"] !== "app.bsky.embed.record" &&
       rec.value.embed["$type"] !== "app.bsky.embed.recordWithMedia")
    ) {
      return false;
    }
    const embedRecord = rec.value.embed.record;
    return (
      (embedRecord.record && embedRecord.record.uri && embedRecord.record.uri.includes(did)) ||
      (embedRecord.uri && embedRecord.uri.includes(did))
    );
  });
  const onlyOtherQuotes = onlyQuotes - onlySelfQuotes;

  // Reposts
  const repostRecords = postsRecords.filter((rec) => rec.value["$type"] === "app.bsky.feed.repost");
  const onlyReposts = repostRecords.length;
  const onlySelfReposts = filterRecords(repostRecords, (rec) => {
    if (!rec.value || !rec.value.subject || !rec.value.subject.uri) return false;
    return rec.value.subject.uri.includes(did);
  });
  const onlyOtherReposts = onlyReposts - onlySelfReposts;

  // Images and related stats
  const postsWithImages = filterRecords(
    postsRecords,
    (rec) =>
      rec.value.embed && rec.value.embed["$type"] === "app.bsky.embed.images"
  );
  const imagePostsAltText = filterRecords(postsRecords, (rec) => {
    if (!rec.value.embed || rec.value.embed["$type"] !== "app.bsky.embed.images") {
      return false;
    }
    return (
      rec.value.embed.images &&
      rec.value.embed.images.some((image) => image.alt && image.alt.trim())
    );
  });
  // Compute the count of image posts (with alt text) that are replies.
  const imagePostsReplies = filterRecords(postsRecords, (rec) => {
    const isImagePostWithAlt = rec.value.embed &&
      rec.value.embed["$type"] === "app.bsky.embed.images" &&
      rec.value.embed.images &&
      rec.value.embed.images.some((img) => img.alt && img.alt.trim());
    return isImagePostWithAlt && rec.value.reply;
  });
  const imagePostsNoAltText = postsWithImages - imagePostsAltText;
  const altTextPercentage = postsWithImages ? imagePostsAltText / postsWithImages : 0;
  const postsWithOnlyText = filterRecords(
    postsRecords,
    (rec) =>
      !rec.value.embed &&
      !rec.value.reply &&
      !(rec.value.facets && JSON.stringify(rec.value.facets).includes("app.bsky.richtext.facet#link"))
  );
  const postsWithMentions = filterRecords(postsRecords, (rec) => {
    if (!rec.value || !rec.value.facets) return false;
    return rec.value.facets.some((facet) =>
      facet.features && facet.features.some((feature) => feature["$type"] === "app.bsky.richtext.facet#mention")
    );
  });
  const postsWithVideo = filterRecords(
    postsRecords,
    (rec) =>
      rec.value.embed && rec.value.embed["$type"] === "app.bsky.embed.video"
  );
  const postsWithLinks = filterRecords(postsRecords, (rec) => {
    if (
      rec.value.facets &&
      rec.value.facets.features &&
      rec.value.facets.features.some((f) => f["$type"] === "app.bsky.richtext.facet#link")
    )
      return true;
    if (rec.value.embed && rec.value.embed["$type"] === "app.bsky.embed.external")
      return true;
    return false;
  });

  const postStats = {
    postsCount: roundToTwo(postsCount),
    postsPerDay: periodDays ? roundToTwo(postsCount / periodDays) : 0,
    onlyPosts: roundToTwo(onlyPosts),
    onlyPostsPerDay: periodDays ? roundToTwo(onlyPosts / periodDays) : 0,
    onlyReplies: roundToTwo(onlyReplies),
    onlyRepliesPerDay: periodDays ? roundToTwo(onlyReplies / periodDays) : 0,
    onlyRepliesToSelf: roundToTwo(onlyRepliesToSelf),
    onlyRepliesToSelfPerDay: periodDays ? roundToTwo(onlyRepliesToSelf / periodDays) : 0,
    onlyRepliesToOthers: roundToTwo(onlyRepliesToOthers),
    onlyRepliesToOthersPerDay: periodDays ? roundToTwo(onlyRepliesToOthers / periodDays) : 0,
    onlyQuotes: roundToTwo(onlyQuotes),
    onlyQuotesPerDay: periodDays ? roundToTwo(onlyQuotes / periodDays) : 0,
    onlySelfQuotes: roundToTwo(onlySelfQuotes),
    onlySelfQuotesPerDay: periodDays ? roundToTwo(onlySelfQuotes / periodDays) : 0,
    onlyOtherQuotes: roundToTwo(onlyOtherQuotes),
    onlyOtherQuotesPerDay: periodDays ? roundToTwo(onlyOtherQuotes / periodDays) : 0,
    onlyReposts: roundToTwo(onlyReposts),
    onlyRepostsPerDay: periodDays ? roundToTwo(onlyReposts / periodDays) : 0,
    onlySelfReposts: roundToTwo(onlySelfReposts),
    onlySelfRepostsPerDay: periodDays ? roundToTwo(onlySelfReposts / periodDays) : 0,
    onlyOtherReposts: roundToTwo(onlyOtherReposts),
    onlyOtherRepostsPerDay: periodDays ? roundToTwo(onlyOtherReposts / periodDays) : 0,
    postsWithImages: roundToTwo(postsWithImages),
    imagePostsPerDay: periodDays ? roundToTwo(postsWithImages / periodDays) : 0,
    imagePostsAltText: roundToTwo(imagePostsAltText),
    imagePostsNoAltText: roundToTwo(imagePostsNoAltText),
    altTextPercentage: roundToTwo(altTextPercentage),
    imagePostsReplies: roundToTwo(imagePostsReplies),
    postsWithOnlyText: roundToTwo(postsWithOnlyText),
    textPostsPerDay: periodDays ? roundToTwo(postsWithOnlyText / periodDays) : 0,
    postsWithMentions: roundToTwo(postsWithMentions),
    mentionPostsPerDay: periodDays ? roundToTwo(postsWithMentions / periodDays) : 0,
    postsWithVideo: roundToTwo(postsWithVideo),
    videoPostsPerDay: periodDays ? roundToTwo(postsWithVideo / periodDays) : 0,
    postsWithLinks: roundToTwo(postsWithLinks),
    linkPostsPerDay: periodDays ? roundToTwo(postsWithLinks / periodDays) : 0,

    // Percentages
    replyPercentage: postsCount ? roundToTwo(onlyReplies / postsCount) : 0,
    replySelfPercentage: postsCount ? roundToTwo(onlyRepliesToSelf / postsCount) : 0,
    replyOtherPercentage: postsCount ? roundToTwo(onlyRepliesToOthers / postsCount) : 0,
    quotePercentage: postsCount ? roundToTwo(onlyQuotes / postsCount) : 0,
    quoteSelfPercentage: postsCount ? roundToTwo(onlySelfQuotes / postsCount) : 0,
    quoteOtherPercentage: postsCount ? roundToTwo(onlyOtherQuotes / postsCount) : 0,
    repostPercentage: postsCount ? roundToTwo(onlyReposts / postsCount) : 0,
    repostSelfPercentage: postsCount ? roundToTwo(onlySelfReposts / postsCount) : 0,
    repostOtherPercentage: postsCount ? roundToTwo(onlyOtherReposts / postsCount) : 0,
    textPercentage: postsCount ? roundToTwo(postsWithOnlyText / postsCount) : 0,
    linkPercentage: postsCount ? roundToTwo(postsWithLinks / postsCount) : 0,
    imagePercentage: postsCount ? roundToTwo(postsWithImages / postsCount) : 0,
    videoPercentage: postsCount ? roundToTwo(postsWithVideo / postsCount) : 0,
  };

  return postStats;
}
