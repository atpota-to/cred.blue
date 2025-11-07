/**
 * CAR File Parser Utility
 * 
 * This module provides utilities for fetching and parsing CAR (Content Addressable aRchive) files
 * from AT Protocol repositories using the com.atproto.sync.getRepo endpoint.
 */

import { CarReader } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';

// Cache for parsed repo data
const repoCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Get cached repo data if available and not expired
 * @param {string} did - The DID to check cache for
 * @returns {Object|null} Cached data or null
 */
function getCachedRepoData(did) {
  const cached = repoCache.get(did);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`Using cached data for ${did}`);
    return cached.data;
  }
  return null;
}

/**
 * Cache repo data
 * @param {string} did - The DID to cache data for
 * @param {Object} data - The data to cache
 */
function setCachedRepoData(did, data) {
  repoCache.set(did, {
    data,
    timestamp: Date.now()
  });
  console.log(`Cached data for ${did}`);
}

/**
 * Clear cache for a specific DID or all cache
 * @param {string} did - Optional DID to clear, if not provided clears all
 */
export function clearRepoCache(did = null) {
  if (did) {
    repoCache.delete(did);
    console.log(`Cleared cache for ${did}`);
  } else {
    repoCache.clear();
    console.log('Cleared all cache');
  }
}

/**
 * Fetch a repository as a CAR file from the AT Protocol sync endpoint
 * @param {string} did - The DID of the user
 * @param {string} serviceEndpoint - The PDS service endpoint (optional, defaults to bsky.network)
 * @returns {Promise<ArrayBuffer>} The CAR file as an ArrayBuffer
 */
export async function fetchRepoAsCar(did, serviceEndpoint = null) {
  try {
    // If no service endpoint provided, use the public bsky endpoint
    const endpoint = serviceEndpoint || 'https://bsky.network';
    const url = `${endpoint}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
    
    console.log(`Fetching CAR file from: ${url}`);
    const startTime = performance.now();
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch repo: ${response.status} ${response.statusText}`);
    }
    
    const carBytes = await response.arrayBuffer();
    const fetchTime = performance.now() - startTime;
    
    console.log(`CAR file fetched: ${(carBytes.byteLength / 1024 / 1024).toFixed(2)} MB in ${fetchTime.toFixed(0)}ms`);
    
    return carBytes;
  } catch (error) {
    console.error('Error fetching CAR file:', error);
    throw error;
  }
}

/**
 * Parse a CAR file and extract all blocks
 * @param {ArrayBuffer} carBytes - The CAR file as an ArrayBuffer
 * @returns {Promise<Object>} Object containing root CID and decoded blocks
 */
export async function parseCarFile(carBytes) {
  try {
    console.log('Parsing CAR file...');
    const startTime = performance.now();
    
    // Create a CarReader from the bytes
    const reader = await CarReader.fromBytes(new Uint8Array(carBytes));
    
    // Get the root CID
    const roots = await reader.getRoots();
    const root = roots[0];
    
    console.log(`Root CID: ${root.toString()}`);
    
    // Extract all blocks
    const blocks = [];
    const blocksByCid = new Map();
    
    for await (const { cid, bytes } of reader.blocks()) {
      blocks.push({ cid, bytes });
      blocksByCid.set(cid.toString(), bytes);
    }
    
    const parseTime = performance.now() - startTime;
    console.log(`Parsed ${blocks.length} blocks in ${parseTime.toFixed(0)}ms`);
    
    return {
      root,
      blocks,
      blocksByCid,
      totalBlocks: blocks.length
    };
  } catch (error) {
    console.error('Error parsing CAR file:', error);
    throw error;
  }
}

/**
 * Decode a CBOR-encoded block into a JavaScript object
 * @param {Uint8Array} bytes - The CBOR-encoded bytes
 * @returns {Object} The decoded object
 */
export function decodeBlock(bytes) {
  try {
    return dagCbor.decode(bytes);
  } catch (error) {
    console.error('Error decoding block:', error);
    throw error;
  }
}

/**
 * Extract and categorize records from parsed CAR blocks
 * @param {Array} blocks - Array of blocks from parseCarFile
 * @returns {Object} Categorized records by collection type
 */
export function extractRecords(blocks) {
  console.log('Extracting records from blocks...');
  const startTime = performance.now();
  
  const records = {
    posts: [],
    likes: [],
    reposts: [],
    follows: [],
    blocks: [],
    lists: [],
    listItems: [],
    profiles: [],
    other: [],
    collections: new Set(),
    totalRecords: 0
  };
  
  for (const { cid, bytes } of blocks) {
    try {
      const decoded = decodeBlock(bytes);
      
      // Check if this is a record with a $type field
      if (decoded && typeof decoded === 'object' && decoded.$type) {
        records.totalRecords++;
        records.collections.add(decoded.$type);
        
        // Categorize by collection type
        switch (decoded.$type) {
          case 'app.bsky.feed.post':
            records.posts.push({ cid: cid.toString(), ...decoded });
            break;
          case 'app.bsky.feed.like':
            records.likes.push({ cid: cid.toString(), ...decoded });
            break;
          case 'app.bsky.feed.repost':
            records.reposts.push({ cid: cid.toString(), ...decoded });
            break;
          case 'app.bsky.graph.follow':
            records.follows.push({ cid: cid.toString(), ...decoded });
            break;
          case 'app.bsky.graph.block':
            records.blocks.push({ cid: cid.toString(), ...decoded });
            break;
          case 'app.bsky.graph.list':
            records.lists.push({ cid: cid.toString(), ...decoded });
            break;
          case 'app.bsky.graph.listitem':
            records.listItems.push({ cid: cid.toString(), ...decoded });
            break;
          case 'app.bsky.actor.profile':
            records.profiles.push({ cid: cid.toString(), ...decoded });
            break;
          default:
            records.other.push({ cid: cid.toString(), type: decoded.$type, ...decoded });
        }
      }
    } catch (error) {
      // Skip blocks that can't be decoded (might be binary data, etc.)
      continue;
    }
  }
  
  const extractTime = performance.now() - startTime;
  console.log(`Extracted ${records.totalRecords} records in ${extractTime.toFixed(0)}ms`);
  console.log('Collections found:', Array.from(records.collections));
  
  return {
    ...records,
    collections: Array.from(records.collections)
  };
}

/**
 * Complete pipeline: fetch, parse, and extract records from a repo
 * @param {string} did - The DID of the user
 * @param {string} serviceEndpoint - The PDS service endpoint (optional)
 * @param {boolean} useCache - Whether to use cached data (default: true)
 * @returns {Promise<Object>} Parsed and categorized repo data
 */
export async function getRepoData(did, serviceEndpoint = null, useCache = true) {
  try {
    // Check cache first
    if (useCache) {
      const cachedData = getCachedRepoData(did);
      if (cachedData) {
        return cachedData;
      }
    }
    
    console.log(`\n=== Fetching repo data for ${did} ===`);
    const totalStartTime = performance.now();
    
    // Step 1: Fetch CAR file
    const carBytes = await fetchRepoAsCar(did, serviceEndpoint);
    
    // Step 2: Parse CAR file
    const { root, blocks, blocksByCid, totalBlocks } = await parseCarFile(carBytes);
    
    // Step 3: Extract and categorize records
    const records = extractRecords(blocks);
    
    const totalTime = performance.now() - totalStartTime;
    
    const summary = {
      did,
      root: root.toString(),
      totalBlocks,
      carFileSizeMB: (carBytes.byteLength / 1024 / 1024).toFixed(2),
      processingTimeMs: totalTime.toFixed(0),
      records,
      stats: {
        posts: records.posts.length,
        likes: records.likes.length,
        reposts: records.reposts.length,
        follows: records.follows.length,
        blocks: records.blocks.length,
        lists: records.lists.length,
        listItems: records.listItems.length,
        profiles: records.profiles.length,
        other: records.other.length,
        collections: records.collections
      }
    };
    
    console.log('\n=== Repo Data Summary ===');
    console.log(`Total blocks: ${totalBlocks}`);
    console.log(`Total records: ${records.totalRecords}`);
    console.log(`Posts: ${records.posts.length}`);
    console.log(`Likes: ${records.likes.length}`);
    console.log(`Reposts: ${records.reposts.length}`);
    console.log(`Follows: ${records.follows.length}`);
    console.log(`Processing time: ${totalTime.toFixed(0)}ms`);
    console.log('========================\n');
    
    // Cache the result
    if (useCache) {
      setCachedRepoData(did, summary);
    }
    
    return summary;
  } catch (error) {
    console.error('Error in getRepoData:', error);
    throw error;
  }
}

/**
 * Helper function to resolve a handle to a DID
 * @param {string} handle - The handle to resolve (e.g., "dame.bsky.social")
 * @returns {Promise<string>} The resolved DID
 */
export async function resolveHandleToDid(handle) {
  try {
    const url = `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to resolve handle: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.did) {
      throw new Error('No DID found in response');
    }
    
    return data.did;
  } catch (error) {
    console.error('Error resolving handle:', error);
    throw error;
  }
}

/**
 * Helper function to get the service endpoint for a DID
 * @param {string} did - The DID to look up
 * @returns {Promise<string>} The service endpoint URL
 */
export async function getServiceEndpointForDid(did) {
  try {
    let url;
    
    if (did.startsWith('did:web:')) {
      const domain = did.slice('did:web:'.length);
      url = `https://${domain}/.well-known/did.json`;
    } else if (did.startsWith('did:plc:')) {
      url = `https://plc.directory/${encodeURIComponent(did)}`;
    } else {
      throw new Error(`Unsupported DID method: ${did}`);
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch DID document: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.service || !Array.isArray(data.service)) {
      throw new Error('No service endpoints found in DID document');
    }
    
    const pdsService = data.service.find(svc => svc.type === 'AtprotoPersonalDataServer');
    
    if (!pdsService || !pdsService.serviceEndpoint) {
      throw new Error('No PDS service endpoint found');
    }
    
    return pdsService.serviceEndpoint;
  } catch (error) {
    console.error('Error getting service endpoint:', error);
    throw error;
  }
}

