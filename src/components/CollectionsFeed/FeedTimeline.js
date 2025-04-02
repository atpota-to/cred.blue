import React, { useState } from 'react';
import './FeedTimeline.css';
import { formatDistanceToNow } from 'date-fns';

const FeedTimeline = ({ records, serviceEndpoint }) => {
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

  // Helper to extract readable content from different record types
  const getRecordContent = (record) => {
    // Extract from specific record types
    if (record.value) {
      // Handle posts with text
      if (record.value.text) {
        return {
          label: 'Text',
          content: record.value.text.length > 100 
            ? `${record.value.text.substring(0, 100)}...` 
            : record.value.text
        };
      }
      
      // Handle likes
      if (record.collection === 'app.bsky.feed.like' && record.value.subject?.uri) {
        return {
          label: 'Liked',
          content: record.value.subject.uri.split('/').pop(),
          subjectUri: record.value.subject.uri,
          subjectCid: record.value.subject.cid
        };
      }
      
      // Handle reposts
      if (record.collection === 'app.bsky.feed.repost' && record.value.subject?.uri) {
        return {
          label: 'Reposted',
          content: record.value.subject.uri.split('/').pop(),
          subjectUri: record.value.subject.uri,
          subjectCid: record.value.subject.cid
        };
      }
      
      // Handle follows
      if (record.collection === 'app.bsky.graph.follow' && record.value.subject) {
        return {
          label: 'Followed',
          content: record.value.subject
        };
      }
      
      // Handle generic subject for other types
      if (record.value.subject?.uri) {
        return {
          label: 'Subject',
          content: record.value.subject.uri.split('/').pop(),
          subjectUri: record.value.subject.uri,
          subjectCid: record.value.subject.cid
        };
      }
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
    <div className="feed-timeline">
      {records.map((record, index) => {
        const content = getRecordContent(record);
        
        return (
          <div key={`${record.collection}-${record.rkey}-${index}`} className="feed-item">
            <div className="feed-item-header">
              <div className="collection-type">
                <span className="collection-name">{record.collection.split('.').pop()}</span>
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
                </div>
              )}
            </div>
            
            <div className="feed-item-footer">
              <div className="record-timestamp">
                {formatRelativeTime(record.timestamp)}
              </div>
            </div>
          </div>
        );
      })}
      
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
                <div className="record-json">
                  {JSON.stringify(modalData, null, 2)}
                </div>
              )}
            </div>
            
            <div className="record-modal-footer">
              <span>URI: {selectedRecord.uri}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedTimeline;