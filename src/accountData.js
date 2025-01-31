/***********************************************************************
 * New functions to resolve handle and service endpoint
 ***********************************************************************/

// Resolve a handle (e.g., "dame.bsky.social") into a DID using the atproto resolveHandle endpoint.
async function resolveHandleToDid(inputHandle) {
  const url = `${publicServiceEndpoint}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(inputHandle)}`;
  const data = await getJSON(url);
  if (!data.did) {
    throw new Error("Could not resolve handle to DID.");
  }
  return data.did;
}

// Get the service endpoint for the DID by querying the PLC directory.
async function getServiceEndpointForDid(resolvedDid) {
  const url = `${plcDirectoryEndpoint}/${encodeURIComponent(resolvedDid)}`;
  const data = await getJSON(url);
  if (!data.service || !Array.isArray(data.service)) {
    throw new Error("Could not determine service endpoint for DID.");
  }
  // Look for the service entry with type "AtprotoPersonalDataServer"
  const svcEntry = data.service.find((svc) => svc.type === "AtprotoPersonalDataServer");
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
 * Progress Batching Helpers
 ***********************************************************************/
// These functions aggregate fast progress increments
let _actualFetchCount = 0;
let _displayedFetchCount = 0;
let _progressUpdateTimer = null;

function incrementProgress(count = 1, onProgress) {
  _actualFetchCount += count;
  if (!_progressUpdateTimer) {
    _progressUpdateTimer = setInterval(() => {
      if (_displayedFetchCount < _actualFetchCount) {
        // Increase by 1 (or more if needed)
        _displayedFetchCount += Math.min(1, _actualFetchCount - _displayedFetchCount);
        onProgress(_displayedFetchCount);
      }
      if (_displayedFetchCount >= _actualFetchCount) {
        clearInterval(_progressUpdateTimer);
        _progressUpdateTimer = null;
      }
    }, 100); // update every 100ms
  }
}

function finalizeProgress(onProgress) {
  clearInterval(_progressUpdateTimer);
  _progressUpdateTimer = null;
  _displayedFetchCount = _actualFetchCount;
  onProgress(_displayedFetchCount);
}

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
async function fetchAllBlobsCount(onPage = (inc) => {}, expectedPages = 2, cutoffTime = null) {
  let urlBase = `${serviceEndpoint}/xrpc/com.atproto.sync.listBlobs?did=${encodeURIComponent(did)}&limit=1000`;
  let count = 0, cursor = null;
  do {
    const url = urlBase + (cursor ? `&cursor=${cursor}` : "");
    const data = await cachedGetJSON(url);
    if (Array.isArray(data.cids)) {
      for (const cid of data.cids) {
        // Assuming each CID may have a 'createdAt' field; adjust based on actual API response
        if (data.blobs && data.blobs[cid]) {
          const blob = data.blobs[cid];
          const createdAt = findFirstCreatedAt(blob);
          if (cutoffTime) {
            if (createdAt) {
              const recordTime = new Date(createdAt).getTime();
              if (recordTime >= cutoffTime) {
                count += 1;
              } else {
                // Since blobs are not necessarily ordered, we continue
                // Alternatively, if blobs are ordered, we could break here
              }
            } else {
              // No 'createdAt', include it as per instruction
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
    onPage(1 / expectedPages);
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

// 4. Fetch records from a collection (paginated)
async function fetchRecordsForCollection(collectionName, onPage = (inc) => {}, expectedPages = 50, cutoffTime = null) {
  let urlBase = `${serviceEndpoint}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collectionName)}&limit=100`;
  let records = [];
  let cursor = null;
  let shouldContinue = true;
  do {
    const url = urlBase + (cursor ? `&cursor=${cursor}` : "");
    const data = await cachedGetJSON(url);
    let newRecords = []; // Declare newRecords outside the if block
    if (Array.isArray(data.records)) {
      for (const rec of data.records) {
        if (cutoffTime) {
          const createdAt = findFirstCreatedAt(rec);
          if (createdAt) {
            const recordTime = new Date(createdAt).getTime();
            if (recordTime >= cutoffTime) {
              newRecords.push(rec);
            } else {
              // Record is older than cutoff; stop fetching more
              shouldContinue = false;
              break;
            }
          } else {
            // No 'createdAt', include it as per instruction
            newRecords.push(rec);
          }
        } else {
          newRecords.push(rec);
        }
      }
      records = records.concat(newRecords);
      // If we stopped early due to cutoff, exit the loop
      if (cutoffTime && newRecords.length < data.records.length) {
        shouldContinue = false;
      }
    }
    incrementProgress(1, onPage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    cursor = data.cursor || null;
    if (cutoffTime && (!cursor || newRecords.length === 0)) {
      shouldContinue = false;
    }
  } while (cursor && shouldContinue);
  return records;
}

// 5. Fetch audit log from PLC Directory (one-shot)
async function fetchAuditLog() {
  const url = `${plcDirectoryEndpoint}/${encodeURIComponent(did)}/log/audit`;
  return await cachedGetJSON(url);
}

// 6. Fetch author feed (paginated)
async function fetchAuthorFeed(onPage = (inc) => {}, expectedPages = 10, cutoffTime = null) {
  let urlBase = `${publicServiceEndpoint}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=100`;
  let feed = [];
  let cursor = null;
  let shouldContinue = true;

  do {
    const url = urlBase + (cursor ? `&cursor=${cursor}` : "");
    const data = await cachedGetJSON(url);
    let newRecords = []; // Initialize newRecords for the current page

    if (Array.isArray(data.feed)) {
      for (const item of data.feed) {
        if (cutoffTime) {
          const createdAt = findFirstCreatedAt(item);
          if (createdAt) {
            const itemTime = new Date(createdAt).getTime();
            if (itemTime >= cutoffTime) {
              feed.push(item);
              newRecords.push(item); // Track the added record
            } else {
              // Item is older than cutoff; stop fetching more
              shouldContinue = false;
              break;
            }
          } else {
            // No 'createdAt', include it as per instruction
            feed.push(item);
            newRecords.push(item); // Track the added record
          }
        } else {
          // No cutoffTime specified, include all items
          feed.push(item);
          newRecords.push(item); // Track the added record
        }
      }

      // If we stopped early due to cutoff, exit the loop
      if (cutoffTime && newRecords.length < data.feed.length) {
        shouldContinue = false;
      }
    }

    incrementProgress(1, onPage);
    await new Promise((resolve) => setTimeout(resolve, 0));
    cursor = data.cursor || null;

    // Corrected condition: Use newRecords.length instead of undefined newRecords
    if (cutoffTime && (!cursor || newRecords.length === 0)) {
      shouldContinue = false;
    }
  } while (cursor && shouldContinue);

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
  if (postsPerDay < 0.1 && stats.totalBskyRecordsPerDay > 0.3) {
    return "Lurker";
  }
  if (onlyPostsPerDay > 0.8 && replyOtherPercentage >= 0.3) {
    if (textPercentage > linkPercentage && textPercentage > imagePercentage && textPercentage > videoPercentage) {
      return "Engaged Text Poster";
    }
    if (imagePercentage > linkPercentage && imagePercentage > textPercentage && imagePercentage > videoPercentage) {
      return altTextPercentage <= 0.3 ? "Engaged Image Poster who's bad at alt text" : "Engaged Image Poster";
    }
    if (linkPercentage > imagePercentage && linkPercentage > textPercentage && linkPercentage > videoPercentage) {
      return "Engaged Link Poster";
    }
    if (videoPercentage > imagePercentage && videoPercentage > textPercentage && videoPercentage > linkPercentage) {
      return "Engaged Video Poster";
    }
    return "Engaged Poster";
  } else if (onlyPostsPerDay > 0.8 && replyOtherPercentage < 0.3) {
    if (textPercentage > linkPercentage && textPercentage > imagePercentage && textPercentage > videoPercentage) {
      return "Unengaged Text Poster";
    }
    if (imagePercentage > linkPercentage && imagePercentage > textPercentage && imagePercentage > videoPercentage) {
      return altTextPercentage <= 0.3 ? "Unengaged Image Poster who's bad at alt text" : "Unengaged Image Poster";
    }
    if (linkPercentage > imagePercentage && linkPercentage > textPercentage && linkPercentage > videoPercentage) {
      return "Unengaged Link Poster";
    }
    if (videoPercentage > imagePercentage && videoPercentage > textPercentage && videoPercentage > linkPercentage) {
      return "Unengaged Video Poster";
    }
    return "Unengaged Poster";
  }
  if (replyOtherPercentage >= 0.5) return "Reply Guy";
  if (stats.quoteOtherPercentage >= 0.5) return "Quote Guy";
  if (stats.repostOtherPercentage >= 0.5) return "Repost Guy";
  return "Unknown";
}

function calculateSocialStatus({ ageInDays, followersCount, followsCount }) {
  const followPercentage = followersCount > 0 ? followsCount / followersCount : 0;
  if (ageInDays < 30) return "Newbie";
  if (followPercentage < 0.5) {
    if (followersCount >= 500 && followersCount < 10000) return "Micro Influencer";
    if (followersCount >= 10000 && followersCount < 100000) return "Influencer";
    if (followersCount >= 100000) return "Celebrity";
  }
  return "Community Member";
}

function calculateActivityStatus(rate) {
  if (rate === 0) return "inactive";
  if (rate > 0 && rate < 1) return "barely active";
  if (rate >= 1 && rate < 10) return "active";
  if (rate >= 10) return "very active";
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
      const domain = parts.slice(1).join(".");
      len = domain.length;
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
    // First, set the handle from input and resolve to DID and service endpoint.
    if (!inputHandle) throw new Error("Handle is not provided");
    handle = inputHandle;
    did = await resolveHandleToDid(handle);
    serviceEndpoint = await getServiceEndpointForDid(did);

    // ----- PROGRESS TRACKING -----
    // Use our batched progress helper.
    const updateProgress = () => { 
      incrementProgress(1, onProgress); 
    };

    // 1. Resolve handle phase.
    await resolveHandleToDid(handle);

    // 2. Fetch profile (one-shot)
    const profile = await fetchProfile();

    // 3. Calculate age (one-shot)
    const { ageInDays, agePercentage } = calculateAge(profile.createdAt);

    // 4. Fetch blobs (paginated) - not tracked for progress
    const cutoffTimeAll = null; // No cutoff for all-time data
    const blobsCountAll = await fetchAllBlobsCount(() => {}, 10, cutoffTimeAll);

    // 5. Repo description (one-shot)
    const repoDescription = await fetchRepoDescription();
    let collections = repoDescription.collections || [];
    const totalCollections = collections.length;
    const bskyCollectionNames = collections.filter((col) => col.startsWith("app.bsky"));
    const totalBskyCollections = bskyCollectionNames.length;
    const totalNonBskyCollections = totalCollections - totalBskyCollections;

    // 6. Build targetCollections array (one-shot)
    const targetCollections = [...new Set(collections)];

    // 7. Aggregate record counts for overall data (if needed)
    const { totalRecords, totalBskyRecords, totalNonBskyRecords, collectionStats } =
      await calculateRecordsAggregate(targetCollections, ageInDays, cutoffTimeAll);
    const totalRecordsPerDay = ageInDays ? totalRecords / ageInDays : 0;
    const totalBskyRecordsPerDay = ageInDays ? totalBskyRecords / ageInDays : 0;
    const totalNonBskyRecordsPerDay = ageInDays ? totalNonBskyRecords / ageInDays : 0;

    // 8. Detailed post statistics (paginated listRecords for "app.bsky.feed.post")
    const cutoffTimeAllRecords = null; // No cutoff for all-time data
    const postsRecords = await fetchRecordsForCollection(
      "app.bsky.feed.post",
      () => { updateProgress(); },
      20,
      cutoffTimeAllRecords
    );
    const postsCount = profile.postsCount || postsRecords.length;

    function filterRecords(records, testFunc) {
      return records.filter(testFunc).length;
    }

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

    // Also, for reposts (paginated, expected pages for reposts)
    const repostRecords = await fetchRecordsForCollection(
      "app.bsky.feed.repost",
      () => { updateProgress(); },
      10,
      cutoffTimeAllRecords
    );
    const onlyReposts = repostRecords.length;
    const onlySelfReposts = filterRecords(repostRecords, (rec) => {
      if (!rec.value || !rec.value.subject || !rec.value.subject.uri) return false;
      return rec.value.subject.uri.includes(did);
    });
    const onlyOtherReposts = onlyReposts - onlySelfReposts;
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
      // Check that the post has the image embed type and alt text...
      const isImagePostWithAlt = rec.value.embed &&
      rec.value.embed["$type"] === "app.bsky.embed.images" &&
      rec.value.embed.images &&
      rec.value.embed.images.some((img) => img.alt && img.alt.trim());
      // ...and that it is a reply (i.e. the record has a reply property).
      return isImagePostWithAlt && rec.value.reply;
    });
    const imagePostsNoAltText = postsWithImages - imagePostsAltText;
    const altTextPercentage = postsWithImages ? imagePostsAltText / postsWithImages : 0;
    const postsWithOnlyText = filterRecords(
      postsRecords,
      (rec) =>
        !rec.value.embed &&
        !rec.value.reply &&
        !(rec.value.facets && JSON.stringify(rec.value.facets).indexOf("app.bsky.richtext.facet#link") !== -1)
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
      postsPerDay: ageInDays ? roundToTwo(postsCount / ageInDays) : 0,
      onlyPosts: roundToTwo(onlyPosts),
      onlyPostsPerDay: ageInDays ? roundToTwo(onlyPosts / ageInDays) : 0,
      onlyReplies: roundToTwo(onlyReplies),
      onlyRepliesPerDay: ageInDays ? roundToTwo(onlyReplies / ageInDays) : 0,
      onlyRepliesToSelf: roundToTwo(onlyRepliesToSelf),
      onlyRepliesToSelfPerDay: ageInDays ? roundToTwo(onlyRepliesToSelf / ageInDays) : 0,
      onlyRepliesToOthers: roundToTwo(onlyRepliesToOthers),
      onlyRepliesToOthersPerDay: ageInDays ? roundToTwo(onlyRepliesToOthers / ageInDays) : 0,
      onlyQuotes: roundToTwo(onlyQuotes),
      onlyQuotesPerDay: ageInDays ? roundToTwo(onlyQuotes / ageInDays) : 0,
      onlySelfQuotes: roundToTwo(onlySelfQuotes),
      onlySelfQuotesPerDay: ageInDays ? roundToTwo(onlySelfQuotes / ageInDays) : 0,
      onlyOtherQuotes: roundToTwo(onlyOtherQuotes),
      onlyOtherQuotesPerDay: ageInDays ? roundToTwo(onlyOtherQuotes / ageInDays) : 0,
      onlyReposts: roundToTwo(onlyReposts),
      onlyRepostsPerDay: ageInDays ? roundToTwo(onlyReposts / ageInDays) : 0,
      onlySelfReposts: roundToTwo(onlySelfReposts),
      onlySelfRepostsPerDay: ageInDays ? roundToTwo(onlySelfReposts / ageInDays) : 0,
      onlyOtherReposts: roundToTwo(onlyOtherReposts),
      onlyOtherRepostsPerDay: ageInDays ? roundToTwo(onlyOtherReposts / ageInDays) : 0,
      postsWithImages: roundToTwo(postsWithImages),
      imagePostsPerDay: ageInDays ? roundToTwo(postsWithImages / ageInDays) : 0,
      imagePostsAltText: roundToTwo(imagePostsAltText),
      imagePostsNoAltText: roundToTwo(imagePostsNoAltText),
      altTextPercentage: roundToTwo(altTextPercentage),
      imagePostsReplies: roundToTwo(imagePostsReplies),
      postsWithOnlyText: roundToTwo(postsWithOnlyText),
      textPostsPerDay: ageInDays ? roundToTwo(postsWithOnlyText / ageInDays) : 0,
      postsWithMentions: roundToTwo(postsWithMentions),
      mentionPostsPerDay: ageInDays ? roundToTwo(postsWithMentions / ageInDays) : 0,
      postsWithVideo: roundToTwo(postsWithVideo),
      videoPostsPerDay: ageInDays ? roundToTwo(postsWithVideo / ageInDays) : 0,
      postsWithLinks: roundToTwo(postsWithLinks),
      linkPostsPerDay: ageInDays ? roundToTwo(postsWithLinks / ageInDays) : 0,
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
      totalBskyRecordsPerDay: roundToTwo(totalBskyRecordsPerDay),
      totalNonBskyRecordsPerDay: roundToTwo(totalNonBskyRecordsPerDay),
    };

    // 9. Parse audit log (one-shot)
    const rawAuditData = await fetchAuditLog();
    let auditRecords = Array.isArray(rawAuditData) ? rawAuditData : Object.values(rawAuditData);
    const plcOperations = auditRecords.length;
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
    const totalAkas = akaSet.size;
    const totalBskyAkas = Array.from(akaSet).filter((alias) => alias.includes("bsky.social")).length;
    const totalCustomAkas = roundToTwo(totalAkas - totalBskyAkas);
    const rotationKeysRounded = roundToTwo(rotationKeys);
    const activeAkasRounded = roundToTwo(activeAkas);

    // 10. Compute engagements using calculateEngagements
    const engagements = await calculateEngagements();

    // 11. Compute overall activity statuses (one-shot)
    const overallActivityStatus = calculateActivityStatus(totalRecordsPerDay);
    const bskyActivityStatus = calculateActivityStatus(totalBskyRecordsPerDay);
    const atprotoActivityStatus = calculateActivityStatus(totalNonBskyRecordsPerDay);

    // 12. Compute posting style (one-shot)
    const postingStyleCalc = calculatePostingStyle({
      ...postStats,
      totalBskyRecordsPerDay,
    });

    // 13. Compute social status (one-shot)
    const socialStatusCalc = calculateSocialStatus({
      ageInDays,
      followersCount: profile.followersCount || 0,
      followsCount: profile.followsCount || 0,
    });

    // 14. Build analysis narrative (one-shot)
    const narrative = buildAnalysisNarrative({
      profile,
      activityAll: {
        activityStatus: overallActivityStatus,
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
        totalNonBskyRecordsPerDay: roundToTwo(totalNonBskyRecordsPerDay),
        totalNonBskyRecordsPercentage: totalRecords ? roundToTwo(totalNonBskyRecords / totalRecords) : 0,
        plcOperations: roundToTwo(plcOperations),
        ...collectionStats,
        "app.bsky.feed.post": {
          ...postStats,
          engagementsReceived: {
            likesReceived: engagements.likesReceived,
            repostsReceived: engagements.repostsReceived,
            quotesReceived: engagements.quotesReceived,
            repliesReceived: engagements.repliesReceived,
          },
        },
        // Move blobs fields under activityAll
        blobsCount: roundToTwo(blobsCountAll),
        blobsPerDay: ageInDays ? roundToTwo(blobsCountAll / ageInDays) : 0,
        blobsPerPost: postsCount ? roundToTwo(blobsCountAll / postsCount) : 0,
        blobsPerImagePost: postsWithImages ? roundToTwo(blobsCountAll / postsWithImages) : 0,
      },
      postingStyle: postingStyleCalc,
      socialStatus: socialStatusCalc,
      alsoKnownAs: {
        totalAkas,
        totalCustomAkas,
        totalBskyAkas,
      },
    });

    // 15. Compute aggregate records for last 30 days (for accountData30Days)
    const periodDays30 = 30;
    const cutoffTime30 = Date.now() - periodDays30 * 24 * 60 * 60 * 1000;
    const {
      totalRecords: totalRecords30,
      totalBskyRecords: totalBskyRecords30,
      totalNonBskyRecords: totalNonBskyRecords30,
      collectionStats: collectionStats30,
    } = await calculateRecordsAggregate(targetCollections, periodDays30, cutoffTime30);
    const totalRecordsPerDay30 = periodDays30 ? totalRecords30 / periodDays30 : 0;
    const totalBskyRecordsPerDay30 = periodDays30 ? totalBskyRecords30 / periodDays30 : 0;
    const totalNonBskyRecordsPerDay30 = periodDays30 ? totalNonBskyRecords30 / periodDays30 : 0;

    // 16. Compute aggregate records for last 90 days (for accountData90Days)
    const periodDays90 = 90;
    const cutoffTime90 = Date.now() - periodDays90 * 24 * 60 * 60 * 1000;
    const {
      totalRecords: totalRecords90,
      totalBskyRecords: totalBskyRecords90,
      totalNonBskyRecords: totalNonBskyRecords90,
      collectionStats: collectionStats90,
    } = await calculateRecordsAggregate(targetCollections, periodDays90, cutoffTime90);
    const totalRecordsPerDay90 = periodDays90 ? totalRecords90 / periodDays90 : 0;
    const totalBskyRecordsPerDay90 = periodDays90 ? totalBskyRecords90 / periodDays90 : 0;
    const totalNonBskyRecordsPerDay90 = periodDays90 ? totalNonBskyRecords90 / periodDays90 : 0;

    // 17. Construct accountData90Days JSON
    const accountData90Days = {
      profile: {
        ...profile,
        did: profile.did || did,
      },
      displayName: profile.displayName,
      handle: profile.handle,
      did: profile.did || did,
      profileEditedDate: profile.indexedAt,
      profileCompletion: calculateProfileCompletion(profile),
      combinedScore: 250,
      blueskyScore: 150,
      atprotoScore: 100,
      scoreGeneratedAt: new Date().toISOString(),
      serviceEndpoint,
      pdsType: serviceEndpoint.includes("bsky.network") ? "Bluesky" : "Third-party",
      createdAt: profile.createdAt,
      ageInDays: roundToTwo(ageInDays),
      agePercentage: roundToTwo(agePercentage),
      followersCount: roundToTwo(profile.followersCount),
      followsCount: roundToTwo(profile.followsCount),
      followPercentage: profile.followersCount ? roundToTwo(profile.followsCount / profile.followersCount) : 0,
      postsCount: roundToTwo(postsCount),
      rotationKeys: rotationKeysRounded,
      era: calculateEra(profile.createdAt),
      postingStyle: postingStyleCalc,
      socialStatus: socialStatusCalc,
      activityAll: {
        activityStatus: calculateActivityStatus(totalRecordsPerDay90),
        bskyActivityStatus: calculateActivityStatus(totalBskyRecordsPerDay90),
        atprotoActivityStatus: calculateActivityStatus(totalNonBskyRecordsPerDay90),
        totalCollections: roundToTwo(totalCollections),
        totalBskyCollections: roundToTwo(totalBskyCollections),
        totalNonBskyCollections: roundToTwo(totalNonBskyCollections),
        totalRecords: roundToTwo(totalRecords90),
        totalRecordsPerDay: roundToTwo(totalRecordsPerDay90),
        totalBskyRecords: roundToTwo(totalBskyRecords90),
        totalBskyRecordsPerDay: roundToTwo(totalBskyRecords90 / periodDays90),
        totalBskyRecordsPercentage: totalRecords90 ? roundToTwo(totalBskyRecords90 / totalRecords90) : 0,
        totalNonBskyRecords: roundToTwo(totalNonBskyRecords90),
        totalNonBskyRecordsPerDay: roundToTwo(totalNonBskyRecords90 / periodDays90),
        totalNonBskyRecordsPercentage: totalRecords90 ? roundToTwo(totalNonBskyRecords90 / totalRecords90) : 0,
        plcOperations: roundToTwo(plcOperations),
        ...collectionStats90,
        "app.bsky.feed.post": {
          ...postStats,
          engagementsReceived: {
            likesReceived: engagements.likesReceived,
            repostsReceived: engagements.repostsReceived,
            quotesReceived: engagements.quotesReceived,
            repliesReceived: engagements.repliesReceived,
          },
        },
        // Move blobs fields under activityAll
        blobsCount: roundToTwo(blobsCountAll),
        blobsPerDay: ageInDays ? roundToTwo(blobsCountAll / ageInDays) : 0,
        blobsPerPost: postsCount ? roundToTwo(blobsCountAll / postsCount) : 0,
        blobsPerImagePost: postsWithImages ? roundToTwo(blobsCountAll / postsWithImages) : 0,
      },
      alsoKnownAs: {
        totalAkas: roundToTwo(totalAkas),
        activeAkas: activeAkasRounded,
        totalBskyAkas: roundToTwo(totalBskyAkas),
        totalCustomAkas: roundToTwo(totalCustomAkas),
        domainRarity: calculateDomainRarity(profile.handle),
        handleType: profile.handle.includes("bsky.social") ? "default" : "custom",
      },
      analysis: {
        // Update the narrative section to include narrative1, narrative2, and narrative3
        narrative: {
          narrative1: narrative.narrative1,
          narrative2: narrative.narrative2,
          narrative3: narrative.narrative3,
        },
      },
    };

    // 18. Construct accountData30Days JSON
    const accountData30Days = {
      profile: {
        ...profile,
        did: profile.did || did,
      },
      displayName: profile.displayName,
      handle: profile.handle,
      did: profile.did || did,
      profileEditedDate: profile.indexedAt,
      profileCompletion: calculateProfileCompletion(profile),
      combinedScore: 250,
      blueskyScore: 150,
      atprotoScore: 100,
      scoreGeneratedAt: new Date().toISOString(),
      serviceEndpoint,
      pdsType: serviceEndpoint.includes("bsky.network") ? "Bluesky" : "Third-party",
      createdAt: profile.createdAt,
      ageInDays: roundToTwo(ageInDays),
      agePercentage: roundToTwo(agePercentage),
      followersCount: roundToTwo(profile.followersCount),
      followsCount: roundToTwo(profile.followsCount),
      followPercentage: profile.followersCount ? roundToTwo(profile.followsCount / profile.followersCount) : 0,
      postsCount: roundToTwo(postsCount),
      rotationKeys: rotationKeysRounded,
      era: calculateEra(profile.createdAt),
      postingStyle: postingStyleCalc,
      socialStatus: socialStatusCalc,
      activityAll: {
        activityStatus: calculateActivityStatus(totalRecordsPerDay30),
        bskyActivityStatus: calculateActivityStatus(totalBskyRecordsPerDay30),
        atprotoActivityStatus: calculateActivityStatus(totalNonBskyRecordsPerDay30),
        totalCollections: roundToTwo(totalCollections),
        totalBskyCollections: roundToTwo(totalBskyCollections),
        totalNonBskyCollections: roundToTwo(totalNonBskyCollections),
        totalRecords: roundToTwo(totalRecords30),
        totalRecordsPerDay: roundToTwo(totalRecordsPerDay30),
        totalBskyRecords: roundToTwo(totalBskyRecords30),
        totalBskyRecordsPerDay: roundToTwo(totalBskyRecords30 / periodDays30),
        totalBskyRecordsPercentage: totalRecords30 ? roundToTwo(totalBskyRecords30 / totalRecords30) : 0,
        totalNonBskyRecords: roundToTwo(totalNonBskyRecords30),
        totalNonBskyRecordsPerDay: roundToTwo(totalNonBskyRecords30 / periodDays30),
        totalNonBskyRecordsPercentage: totalRecords30 ? roundToTwo(totalNonBskyRecords30 / totalRecords30) : 0,
        plcOperations: roundToTwo(plcOperations),
        ...collectionStats30,
        "app.bsky.feed.post": {
          ...postStats,
          engagementsReceived: {
            likesReceived: engagements.likesReceived,
            repostsReceived: engagements.repostsReceived,
            quotesReceived: engagements.quotesReceived,
            repliesReceived: engagements.repliesReceived,
          },
        },
        // Move blobs fields under activityAll
        blobsCount: roundToTwo(blobsCountAll),
        blobsPerDay: ageInDays ? roundToTwo(blobsCountAll / ageInDays) : 0,
        blobsPerPost: postsCount ? roundToTwo(blobsCountAll / postsCount) : 0,
        blobsPerImagePost: postsWithImages ? roundToTwo(blobsCountAll / postsWithImages) : 0,
      },
      alsoKnownAs: {
        totalAkas: roundToTwo(totalAkas),
        activeAkas: activeAkasRounded,
        totalBskyAkas: roundToTwo(totalBskyAkas),
        totalCustomAkas: roundToTwo(totalCustomAkas),
        domainRarity: calculateDomainRarity(profile.handle),
        handleType: profile.handle.includes("bsky.social") ? "default" : "custom",
      },
      analysis: {
        // Update the narrative section to include narrative1, narrative2, and narrative3
        narrative: {
          narrative1: narrative.narrative1,
          narrative2: narrative.narrative2,
          narrative3: narrative.narrative3,
        },
      },
    };

    // 19. Remove unused aggregation sections (30 and 90 days) as they are now integrated into activityAll.
    // 20. Remove activity30Days and activity90Days sections (already removed in the JSON constructions above)

    // 21. Build final output JSON.
    // Finalize progress so the UI shows the full count.
    finalizeProgress(onProgress);

    const finalOutput = {
      message: "accountData retrieved successfully",
      accountData90Days: accountData90Days,
      accountData30Days: accountData30Days,
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
  const { profile, activityAll, alsoKnownAs } = accountData;
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

  let rotationKeyStatement = accountData.rotationKeys === 2 
      ? "They don't have their own rotation key set" 
      : "They have their own rotation key set";

  let pdsHostStatement = serviceEndpoint.includes("bsky.network")
      ? "their PDS is hosted by a Bluesky mushroom"
      : "their PDS is hosted by either a third-party or themselves";

  // First Paragraph
  const narrative1 =
      `${profile.displayName} has been on the network ${accountAgeStatement} ${calculateActivityStatus(activityAll.totalRecordsPerDay)}. ` +
      `Their profile is ${calculateProfileCompletion(profile)}, and ${blueskyFeatures}. ` +
      `When it comes to the broader AT Proto ecosystem, this identity ${atprotoEngagement}.`;

  // Second Paragraph
  const narrative2 =
      `${domainHistoryStatement} which is ${calculateDomainRarity(profile.handle)}. ` +
      `${rotationKeyStatement}, and ${pdsHostStatement}.`;

  const era = calculateEra(profile.createdAt);
  const postingStyle = accountData.postingStyle;
  const socialStatus = accountData.socialStatus;
  const mediaType = "a mix of text, images, and video";
  const followRatio = profile.followersCount > 0 ? roundToTwo(profile.followsCount / profile.followersCount) : 0;

  // Third Paragraph
  const narrative3 =
      `${profile.displayName} first joined Bluesky during the ${era} era. ` +
      `Their style of posting is "${postingStyle}". ` +
      `Their posts consist of ${mediaType}. ` +
      `They are a "${socialStatus}" as is indicated by their follower count of ${profile.followersCount} and their follower/following ratio of ${followRatio}.`;

  // Return an object containing individual narratives
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
  for (const col of collectionNames) {
    // Fetch records for the specified collection with cutoffTime
    const recs = await fetchRecordsForCollection(col, () => {}, 50, cutoffTime);
    const count = recs.length;
    const perDay = periodDays ? count / periodDays : 0;
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
  return { totalRecords, totalBskyRecords, totalNonBskyRecords, collectionStats };
}

/***********************************************************************
 * Function to calculate engagements for the account using the author feed.
 ***********************************************************************/
async function calculateEngagements(cutoffTime = null) {
  // Use the paginated author feed; expectedPages = 15.
  const feed = await fetchAuthorFeed(() => {}, 15, cutoffTime);
  let likesReceived = 0;
  let repostsReceived = 0;
  let quotesReceived = 0;
  let repliesReceived = 0;
  for (const item of feed) {
    if (item && item.post) {
      if (JSON.stringify(item.post).includes("#reasonRepost")) continue;
      likesReceived += item.post.likeCount || 0;
      repostsReceived += item.post.repostCount || 0;
      quotesReceived += item.post.quoteCount || 0;
      repliesReceived += item.post.replyCount || 0;
    }
  }
  return {
    likesReceived: roundToTwo(likesReceived),
    repostsReceived: roundToTwo(repostsReceived),
    quotesReceived: roundToTwo(quotesReceived),
    repliesReceived: roundToTwo(repliesReceived),
  };
}
