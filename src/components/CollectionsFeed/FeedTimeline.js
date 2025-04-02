import React, { useState } from 'react';
import './FeedTimeline.css';
import { formatDistanceToNow } from 'date-fns';

const FeedTimeline = ({ records, serviceEndpoint, compactView = false }) => {
  // Define all hooks at the top level, before any conditionals
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);
  
  if (!records || records.length === 0) {
    return null;
  }

  // Helper to format the timestamp as a relative time
  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Helper to generate Bluesky app URL from ATProto URI
  const getBskyAppUrl = (uri) => {
    if (!uri || !uri.startsWith('at://')) return null;
    
    // Parse the at:// URI format: at://did:plc:xyz/collection/rkey
    const parts = uri.replace('at://', '').split('/');
    
    if (parts.length < 3) return null;
    
    const did = parts[0];
    const collection = parts[1];
    const rkey = parts[2];
    
    // Handle different collection types
    if (collection === 'app.bsky.feed.post') {
      return `https://bsky.app/profile/${did}/post/${rkey}`;
    } else if (collection === 'app.bsky.feed.generator') {
      return `https://bsky.app/profile/${did}/feed/${rkey}`;
    } else if (collection === 'app.bsky.graph.list') {
      return `https://bsky.app/profile/${did}/lists/${rkey}`;
    } else if (collection === 'app.bsky.actor.profile') {
      return `https://bsky.app/profile/${did}`;
    }
    
    return null;
  };

  // Helper to extract readable content from different record types
  const getRecordContent = (record) => {
    // Extract from specific record types
    if (record.value) {
      // Initialize result object
      let result = null;
      
      // Handle posts with text
      if (record.value.text) {
        result = {
          label: 'Text',
          content: record.value.text.length > 100 
            ? `${record.value.text.substring(0, 100)}...` 
            : record.value.text
        };
        
        // Detect if it's a reply post
        if (record.value.reply && record.value.reply.parent) {
          result.isReply = true;
          result.replyParent = record.value.reply.parent.uri;
          result.replyRoot = record.value.reply.root?.uri || record.value.reply.parent.uri;
        }
        
        // Detect if it's a quote post
        if (record.value.embed && 
            (record.value.embed['$type'] === 'app.bsky.embed.record' || 
             record.value.embed['$type'] === 'app.bsky.embed.recordWithMedia')) {
          result.isQuote = true;
          
          // Extract the quoted record URI
          if (record.value.embed.record) {
            if (record.value.embed.record.uri) {
              result.quotedUri = record.value.embed.record.uri;
            } else if (record.value.embed.record.record && record.value.embed.record.record.uri) {
              result.quotedUri = record.value.embed.record.record.uri;
            }
          }
        }
      }
      
      // Handle likes
      else if (record.collection === 'app.bsky.feed.like' && record.value.subject?.uri) {
        result = {
          label: 'Liked',
          content: record.value.subject.uri.split('/').pop(),
          subjectUri: record.value.subject.uri,
          subjectCid: record.value.subject.cid
        };
      }
      
      // Handle reposts
      else if (record.collection === 'app.bsky.feed.repost' && record.value.subject?.uri) {
        result = {
          label: 'Reposted',
          content: record.value.subject.uri.split('/').pop(),
          subjectUri: record.value.subject.uri,
          subjectCid: record.value.subject.cid
        };
      }
      
      // Handle follows
      else if (record.collection === 'app.bsky.graph.follow' && record.value.subject) {
        result = {
          label: 'Followed',
          content: record.value.subject
        };
      }
      
      // Handle generic subject for other types
      else if (record.value.subject?.uri) {
        result = {
          label: 'Subject',
          content: record.value.subject.uri.split('/').pop(),
          subjectUri: record.value.subject.uri,
          subjectCid: record.value.subject.cid
        };
      }
      
      // If we found content and it has a subject URI for app.bsky collections, add bskyUrl
      if (result && result.subjectUri && result.subjectUri.includes('/app.bsky.')) {
        result.bskyUrl = getBskyAppUrl(result.subjectUri);
      }
      
      // If the record itself is an app.bsky collection, add selfBskyUrl
      if (record.collection.startsWith('app.bsky.')) {
        const selfBskyUrl = getBskyAppUrl(record.uri);
        if (selfBskyUrl) {
          result = result || {};
          result.selfBskyUrl = selfBskyUrl;
        }
      }
      
      // For reply posts, add the parent post URL if possible
      if (result && result.isReply && result.replyParent) {
        result.replyParentUrl = getBskyAppUrl(result.replyParent);
      }
      
      // For quote posts, add the quoted post URL if possible
      if (result && result.isQuote && result.quotedUri) {
        result.quotedUrl = getBskyAppUrl(result.quotedUri);
      }
      
      return result;
    }
    
    // Fallback: no specific content found
    return null;
  };

  // Function to fetch record data
  const fetchRecordData = async (record) => {
    try {
      setModalLoading(true);
      setModalError(null);
      
      // Extract the necessary components from the URI
      const uri = record.uri;
      const uriParts = uri.split('/');
      const did = uriParts[2]; // did:plc:xxx part
      const collection = record.collection;
      const rkey = record.rkey;
      
      // Build the API URL
      const apiUrl = `${serviceEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
      
      // Fetch the record data
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch record: ${response.statusText}`);
      }
      
      const data = await response.json();
      setModalData(data);
    } catch (error) {
      console.error('Error fetching record data:', error);
      setModalError(error.message || 'Failed to fetch record data');
    } finally {
      setModalLoading(false);
    }
  };

  // Function to handle opening the modal
  const openModal = (record) => {
    setSelectedRecord(record);
    fetchRecordData(record);
  };

  // Function to close the modal
  const closeModal = () => {
    setSelectedRecord(null);
    setModalData(null);
    setModalError(null);
  };

  // Function to fetch related record
  const fetchRelatedRecord = async (uri) => {
    try {
      setModalLoading(true);
      setModalError(null);
      
      // Extract components from the URI
      // Format: at://did:plc:xxx/collection/rkey
      const uriParts = uri.split('/');
      const did = uriParts[2]; // did:plc:xxx part
      const collection = uriParts[3];
      const rkey = uriParts[4];
      
      // Build the API URL
      const apiUrl = `${serviceEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
      
      // Fetch the record data
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch related record: ${response.statusText}`);
      }
      
      const data = await response.json();
      setModalData(data);
      setSelectedRecord({
        ...selectedRecord,
        uri: uri,
        collection: collection,
        rkey: rkey
      });
    } catch (error) {
      console.error('Error fetching related record:', error);
      setModalError(error.message || 'Failed to fetch related record data');
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className={`feed-timeline ${compactView ? 'compact-view' : ''}`}>
      {compactView ? (
        // Compact view - simpler list format
        <table className="compact-records-table">
          <thead>
            <tr>
              <th className="collection-col">Collection</th>
              <th className="time-col">Time</th>
              <th className="type-col">Type</th>
              <th className="content-col">Content</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => {
              const content = getRecordContent(record);
              const timestamp = record.contentTimestamp || record.rkeyTimestamp;
              const viewUrl = content?.selfBskyUrl || content?.bskyUrl || null;
              
              return (
                <tr 
                  key={`${record.collection}-${record.rkey}-${index}`}
                  className={record.collection.startsWith('app.bsky.') ? 'bsky-row' : 'atproto-row'}
                >
                  <td className="collection-col">
                    <span className="compact-collection">{record.collection.split('.').pop()}</span>
                  </td>
                  <td className="time-col">
                    <span className="compact-time">{formatRelativeTime(timestamp)}</span>
                  </td>
                  <td className="type-col">
                    <span className="compact-type">
                      {record.collectionType ? record.collectionType.split('.').pop() : '—'}
                      {content?.isReply && <span className="mini-badge reply-badge">R</span>}
                      {content?.isQuote && <span className="mini-badge quote-badge">Q</span>}
                    </span>
                  </td>
                  <td className="content-col">
                    <span className="compact-content" onClick={() => openModal(record)}>
                      {content ? (
                        content.subjectUri ? (
                          <span className="record-link-compact" onClick={(e) => {
                            e.stopPropagation();
                            fetchRelatedRecord(content.subjectUri);
                          }}>
                            {content.content}
                          </span>
                        ) : content.content
                      ) : record.rkey}
                    </span>
                  </td>
                  <td className="actions-col">
                    <div className="compact-actions">
                      <button 
                        className="compact-view-json" 
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal(record);
                        }}
                        title="View JSON"
                      >
                        { }
                      </button>
                      {viewUrl && (
                        <a 
                          href={viewUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="compact-bsky-link"
                          title="View on Bluesky"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 0L14.9282 4V12L8 16L1.0718 12V4L8 0Z" fill="#0085ff"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        // Standard view - original card format
        records.map((record, index) => {
          const content = getRecordContent(record);
          
          return (
            <div 
              key={`${record.collection}-${record.rkey}-${index}`} 
              className={`feed-item ${record.collection.startsWith('app.bsky.') ? 'bsky-item' : 'atproto-item'}`}
            >
              <div className="feed-item-header">
                <div className="collection-type">
                  <span 
                    className={`collection-name ${record.collection.startsWith('app.bsky.') ? 'bsky-collection' : 'atproto-collection'}`}
                  >
                    {record.collection.split('.').pop()}
                  </span>
                  <span className="collection-full">{record.collection}</span>
                </div>
                <div 
                  className="record-rkey record-key-link" 
                  onClick={() => openModal(record)}
                >
                  {record.rkey}
                </div>
              </div>
              
              <div className="feed-item-content">
                {record.value && record.value.$type && (
                  <div className="record-type">
                    <span className="type-label">Type:</span> {record.value.$type}
                    {content && content.isReply && (
                      <span className="post-type-badge post-type-reply">Reply</span>
                    )}
                    {content && content.isQuote && (
                      <span className="post-type-badge post-type-quote">Quote</span>
                    )}
                  </div>
                )}
                
                {content && (
                  <div className="record-content">
                    <span className="content-label">{content.label}:</span>
                    {content.subjectUri ? (
                      <span 
                        className="record-link"
                        onClick={() => fetchRelatedRecord(content.subjectUri)}
                      >
                        {content.content}
                      </span>
                    ) : (
                      <span>{content.content}</span>
                    )}
                    
                    {/* Show Bluesky links for either the record itself or its subject */}
                    <div className="bsky-link-container">
                      {content.bskyUrl && (
                        <a 
                          href={content.bskyUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="bsky-link"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 0L14.9282 4V12L8 16L1.0718 12V4L8 0Z" fill="#0085ff"/>
                          </svg>
                          <span className="bsky-link-text">View on Bluesky (Referenced Content)</span>
                        </a>
                      )}
                      
                      {content.replyParentUrl && (
                        <a 
                          href={content.replyParentUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="bsky-link"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 0L14.9282 4V12L8 16L1.0718 12V4L8 0Z" fill="#0085ff"/>
                          </svg>
                          <span className="bsky-link-text">View Parent Post on Bluesky</span>
                        </a>
                      )}
                      
                      {content.quotedUrl && (
                        <a 
                          href={content.quotedUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="bsky-link"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 0L14.9282 4V12L8 16L1.0718 12V4L8 0Z" fill="#0085ff"/>
                          </svg>
                          <span className="bsky-link-text">View Quoted Post on Bluesky</span>
                        </a>
                      )}
                      
                      {content.selfBskyUrl && !content.bskyUrl && !content.replyParentUrl && !content.quotedUrl && (
                        <a 
                          href={content.selfBskyUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="bsky-link"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 0L14.9282 4V12L8 16L1.0718 12V4L8 0Z" fill="#0085ff"/>
                          </svg>
                          <span className="bsky-link-text">View on Bluesky</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="feed-item-footer">
                <div className="record-timestamp">
                  {formatRelativeTime(record.contentTimestamp || record.rkeyTimestamp)}
                </div>
              </div>
            </div>
          );
        })
      )}
      
      {selectedRecord && (
        <div className="record-modal-backdrop" onClick={closeModal}>
          <div className="record-modal" onClick={(e) => e.stopPropagation()}>
            <div className="record-modal-header">
              <h3 className="record-modal-title">
                {selectedRecord.collection} / {selectedRecord.rkey}
              </h3>
              <button className="record-modal-close" onClick={closeModal}>×</button>
            </div>
            
            <div className="record-modal-content">
              {modalLoading && (
                <div className="record-modal-loading">Loading record data...</div>
              )}
              
              {modalError && (
                <div className="record-modal-error">{modalError}</div>
              )}
              
              {modalData && !modalLoading && !modalError && (
                <div className="record-json-container">
                  <div className="record-json-header">
                    <span>Record Data</span>
                    <button 
                      className="copy-json-button"
                      onClick={(event) => {
                        navigator.clipboard.writeText(JSON.stringify(modalData, null, 2));
                        // Show temporary success message
                        const button = event.currentTarget;
                        button.classList.add('copied');
                        setTimeout(() => button.classList.remove('copied'), 2000);
                      }}
                      title="Copy JSON"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      Copy JSON
                    </button>
                  </div>
                  <div className="record-json">
                    {JSON.stringify(modalData, null, 2)}
                  </div>
                </div>
              )}
            </div>
            
            <div className="record-modal-footer">
              <div className="record-uri">
                <span>URI: {selectedRecord.uri}</span>
                <button 
                  className="copy-button"
                  onClick={(event) => {
                    navigator.clipboard.writeText(selectedRecord.uri);
                    // Show temporary success message
                    const button = event.currentTarget;
                    button.classList.add('copied');
                    setTimeout(() => button.classList.remove('copied'), 2000);
                  }}
                  title="Copy URI"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedTimeline;