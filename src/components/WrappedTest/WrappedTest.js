import React, { useState } from 'react';
import { 
  getRepoData, 
  resolveHandleToDid, 
  getServiceEndpointForDid 
} from '../../utils/carParser';
import { analyzeWrappedData, generateWrappedSummary } from '../../utils/wrappedAnalyzer';
import './WrappedTest.css';

const WrappedTest = () => {
  const [input, setInput] = useState('did:plc:lcieujcfkv4jx7gehsvok3pr');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [repoData, setRepoData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [selectedTab, setSelectedTab] = useState('overview');

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setRepoData(null);
    setAnalysis(null);

    try {
      let did = input.trim();
      
      // If input doesn't start with "did:", assume it's a handle
      if (!did.startsWith('did:')) {
        console.log(`Resolving handle: ${did}`);
        did = await resolveHandleToDid(did);
        console.log(`Resolved to DID: ${did}`);
      }

      // Get the service endpoint for the DID
      console.log(`Getting service endpoint for: ${did}`);
      const serviceEndpoint = await getServiceEndpointForDid(did);
      console.log(`Service endpoint: ${serviceEndpoint}`);

      // Fetch and parse the repo
      const data = await getRepoData(did, serviceEndpoint);
      setRepoData(data);
      
      // Analyze the data
      console.log('Analyzing wrapped data...');
      const wrappedAnalysis = analyzeWrappedData(data.records, did);
      setAnalysis(wrappedAnalysis);
      console.log('Analysis complete:', wrappedAnalysis);
    } catch (err) {
      console.error('Error fetching repo data:', err);
      setError(err.message || 'Failed to fetch repo data');
    } finally {
      setLoading(false);
    }
  };

  const renderOverview = () => {
    if (!repoData) return null;

    return (
      <div className="test-section">
        <h3>Repository Overview</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">DID</div>
            <div className="stat-value small">{repoData.did}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Root CID</div>
            <div className="stat-value small">{repoData.root}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">CAR File Size</div>
            <div className="stat-value">{repoData.carFileSizeMB} MB</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Blocks</div>
            <div className="stat-value">{repoData.totalBlocks.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Processing Time</div>
            <div className="stat-value">{repoData.processingTimeMs} ms</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Records</div>
            <div className="stat-value">{repoData.records.totalRecords.toLocaleString()}</div>
          </div>
        </div>

        <h3>Record Counts by Type</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Posts</div>
            <div className="stat-value">{repoData.stats.posts.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Likes</div>
            <div className="stat-value">{repoData.stats.likes.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Reposts</div>
            <div className="stat-value">{repoData.stats.reposts.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Follows</div>
            <div className="stat-value">{repoData.stats.follows.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Blocks</div>
            <div className="stat-value">{repoData.stats.blocks.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Lists</div>
            <div className="stat-value">{repoData.stats.lists.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">List Items</div>
            <div className="stat-value">{repoData.stats.listItems.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Other</div>
            <div className="stat-value">{repoData.stats.other.toLocaleString()}</div>
          </div>
        </div>

        <h3>Collections Found</h3>
        <div className="collections-list">
          {repoData.stats.collections.map((collection, idx) => (
            <div key={idx} className="collection-item">
              {collection}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPosts = () => {
    if (!repoData || !repoData.records.posts.length) {
      return <div className="test-section">No posts found</div>;
    }

    return (
      <div className="test-section">
        <h3>Posts ({repoData.records.posts.length})</h3>
        <div className="records-list">
          {repoData.records.posts.slice(0, 20).map((post, idx) => (
            <div key={idx} className="record-item">
              <div className="record-header">
                <span className="record-date">
                  {new Date(post.createdAt).toLocaleString()}
                </span>
                <span className="record-cid">{post.cid.substring(0, 20)}...</span>
              </div>
              <div className="record-content">
                {post.text || '(no text)'}
              </div>
              {post.reply && (
                <div className="record-meta">↩️ Reply to post</div>
              )}
              {post.embed && (
                <div className="record-meta">
                  📎 Embed: {post.embed.$type}
                </div>
              )}
            </div>
          ))}
          {repoData.records.posts.length > 20 && (
            <div className="record-item more">
              ... and {repoData.records.posts.length - 20} more posts
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderLikes = () => {
    if (!repoData || !repoData.records.likes.length) {
      return <div className="test-section">No likes found</div>;
    }

    return (
      <div className="test-section">
        <h3>Likes ({repoData.records.likes.length})</h3>
        <div className="records-list">
          {repoData.records.likes.slice(0, 20).map((like, idx) => (
            <div key={idx} className="record-item">
              <div className="record-header">
                <span className="record-date">
                  {new Date(like.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="record-content">
                Liked: {like.subject?.uri || 'Unknown'}
              </div>
            </div>
          ))}
          {repoData.records.likes.length > 20 && (
            <div className="record-item more">
              ... and {repoData.records.likes.length - 20} more likes
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFollows = () => {
    if (!repoData || !repoData.records.follows.length) {
      return <div className="test-section">No follows found</div>;
    }

    return (
      <div className="test-section">
        <h3>Follows ({repoData.records.follows.length})</h3>
        <div className="records-list">
          {repoData.records.follows.slice(0, 20).map((follow, idx) => (
            <div key={idx} className="record-item">
              <div className="record-header">
                <span className="record-date">
                  {new Date(follow.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="record-content">
                Following: {follow.subject || 'Unknown'}
              </div>
            </div>
          ))}
          {repoData.records.follows.length > 20 && (
            <div className="record-item more">
              ... and {repoData.records.follows.length - 20} more follows
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAnalysis = () => {
    if (!analysis) {
      return <div className="test-section">No analysis available. Fetch repo data first.</div>;
    }

    return (
      <div className="test-section">
        <h3>Wrapped Analysis</h3>
        
        {/* Summary */}
        <div className="analysis-summary">
          <h4>Summary</h4>
          <p>{generateWrappedSummary(analysis)}</p>
        </div>

        {/* Overall Stats */}
        <h4>Overall Statistics</h4>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Account Age</div>
            <div className="stat-value">{analysis.overall.accountAgeDays} days</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Posts</div>
            <div className="stat-value">{analysis.overall.totalPosts.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Likes</div>
            <div className="stat-value">{analysis.overall.totalLikes.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Follows</div>
            <div className="stat-value">{analysis.overall.totalFollows.toLocaleString()}</div>
          </div>
        </div>

        {/* Patterns */}
        <h4>Posting Patterns</h4>
        <div className="patterns-info">
          <p><strong>Most Active Hour:</strong> {analysis.patterns.mostActiveHour}:00</p>
          <p><strong>Most Active Day:</strong> {analysis.patterns.mostActiveDay}</p>
          <p><strong>Most Active Month:</strong> {analysis.patterns.mostActiveMonth}</p>
          <p><strong>Posting Style:</strong> {analysis.patterns.isNightOwl ? '🦉 Night Owl' : analysis.patterns.isEarlyBird ? '🐦 Early Bird' : '☀️ Daytime Poster'}</p>
        </div>

        {/* Year by Year */}
        <h4>Activity by Year</h4>
        <div className="year-breakdown">
          {Object.keys(analysis.byYear).sort().reverse().map(year => {
            const yearData = analysis.byYear[year];
            return (
              <div key={year} className="year-card">
                <h5>{year}</h5>
                <div className="year-stats">
                  <div>Posts: {yearData.totalPosts}</div>
                  <div>Likes: {yearData.totalLikes}</div>
                  <div>Reposts: {yearData.totalReposts}</div>
                  <div>Follows: {yearData.totalFollows}</div>
                  <div>Avg Post Length: {yearData.avgPostLength} chars</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Fun Facts */}
        <h4>Fun Facts</h4>
        <div className="fun-facts">
          {analysis.funFacts.map((fact, idx) => (
            <div key={idx} className="fun-fact">
              ✨ {fact}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRaw = () => {
    if (!repoData) return null;

    return (
      <div className="test-section">
        <h3>Raw Data (JSON)</h3>
        <pre className="raw-json">
          {JSON.stringify(repoData, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="wrapped-test-page">
      <div className="test-container">
        <h1>CAR File Parser Test</h1>
        <p className="test-description">
          Test the AT Protocol CAR file parsing functionality. Enter a DID or handle to fetch and analyze their repository.
        </p>

        <div className="test-input-section">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter DID or handle (e.g., dame.bsky.social)"
            className="test-input"
            disabled={loading}
          />
          <button
            onClick={handleFetch}
            disabled={loading || !input.trim()}
            className="test-button"
          >
            {loading ? 'Fetching...' : 'Fetch & Parse Repo'}
          </button>
        </div>

        {loading && (
          <div className="test-loading">
            <div className="loading-spinner"></div>
            <p>Fetching and parsing CAR file... This may take a moment for large repos.</p>
          </div>
        )}

        {error && (
          <div className="test-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {repoData && (
          <>
            <div className="test-tabs">
              <button
                className={selectedTab === 'overview' ? 'tab-active' : ''}
                onClick={() => setSelectedTab('overview')}
              >
                Overview
              </button>
              <button
                className={selectedTab === 'posts' ? 'tab-active' : ''}
                onClick={() => setSelectedTab('posts')}
              >
                Posts
              </button>
              <button
                className={selectedTab === 'likes' ? 'tab-active' : ''}
                onClick={() => setSelectedTab('likes')}
              >
                Likes
              </button>
              <button
                className={selectedTab === 'follows' ? 'tab-active' : ''}
                onClick={() => setSelectedTab('follows')}
              >
                Follows
              </button>
              <button
                className={selectedTab === 'analysis' ? 'tab-active' : ''}
                onClick={() => setSelectedTab('analysis')}
              >
                Analysis
              </button>
              <button
                className={selectedTab === 'raw' ? 'tab-active' : ''}
                onClick={() => setSelectedTab('raw')}
              >
                Raw JSON
              </button>
            </div>

            <div className="test-content">
              {selectedTab === 'overview' && renderOverview()}
              {selectedTab === 'posts' && renderPosts()}
              {selectedTab === 'likes' && renderLikes()}
              {selectedTab === 'follows' && renderFollows()}
              {selectedTab === 'analysis' && renderAnalysis()}
              {selectedTab === 'raw' && renderRaw()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WrappedTest;

