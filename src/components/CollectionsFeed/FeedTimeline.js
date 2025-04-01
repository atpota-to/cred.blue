import React from 'react';
import './FeedTimeline.css';
import { formatDistanceToNow } from 'date-fns';

const FeedTimeline = ({ records }) => {
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

  // Helper to get a readable collection name
  const getCollectionDisplayName = (collection) => {
    // Extract the last part of the collection name (e.g., 'like' from 'app.bsky.feed.like')
    const parts = collection.split('.');
    return parts[parts.length - 1];
  };

  return (
    <div className="feed-timeline">
      {records.map((record, index) => (
        <div key={`${record.collection}-${record.rkey}-${index}`} className="feed-item">
          <div className="feed-item-header">
            <div className="collection-type">
              <span className="collection-name">{getCollectionDisplayName(record.collection)}</span>
              <span className="collection-full">{record.collection}</span>
            </div>
            <div className="record-rkey">{record.rkey}</div>
          </div>
          
          <div className="feed-item-content">
            {record.value && record.value.$type && (
              <div className="record-type">
                <span className="type-label">Type:</span> {record.value.$type}
              </div>
            )}
            
            {record.value && record.value.subject && record.value.subject.uri && (
              <div className="record-subject">
                <span className="subject-label">Subject:</span> {record.value.subject.uri.split('/').pop()}
              </div>
            )}
            
            {record.value && record.value.text && (
              <div className="record-text">
                <span className="text-label">Text:</span> {record.value.text.length > 100 
                  ? `${record.value.text.substring(0, 100)}...` 
                  : record.value.text
                }
              </div>
            )}
          </div>
          
          <div className="feed-item-footer">
            <div className="record-timestamp">
              {formatRelativeTime(record.timestamp)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FeedTimeline;