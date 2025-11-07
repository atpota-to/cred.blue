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

    // Calculate data distribution
    const recordTypes = [
      { name: 'Posts', count: repoData.stats.posts, color: '#667eea' },
      { name: 'Likes', count: repoData.stats.likes, color: '#764ba2' },
      { name: 'Reposts', count: repoData.stats.reposts, color: '#f093fb' },
      { name: 'Follows', count: repoData.stats.follows, color: '#f5576c' },
      { name: 'Blocks', count: repoData.stats.blocks, color: '#ffecd2' },
      { name: 'Lists', count: repoData.stats.lists, color: '#fcb69f' },
      { name: 'List Items', count: repoData.stats.listItems, color: '#a8edea' },
      { name: 'Other', count: repoData.stats.other, color: '#fed6e3' }
    ].filter(type => type.count > 0);

    const totalRecords = recordTypes.reduce((sum, type) => sum + type.count, 0);
    const sortedBySize = [...recordTypes].sort((a, b) => b.count - a.count);

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

        <h3>Data Distribution</h3>
        <div className="data-distribution">
          <div className="distribution-chart">
            {sortedBySize.map((type, idx) => {
              const percentage = ((type.count / totalRecords) * 100).toFixed(1);
              return (
                <div key={idx} className="distribution-bar-container">
                  <div className="distribution-label">
                    <span className="distribution-name">{type.name}</span>
                    <span className="distribution-stats">
                      {type.count.toLocaleString()} ({percentage}%)
                    </span>
                  </div>
                  <div className="distribution-bar-bg">
                    <div 
                      className="distribution-bar"
                      style={{
                        width: `${percentage}%`,
                        background: type.color
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <h3>Largest Data Sections</h3>
        <div className="largest-sections">
          {sortedBySize.slice(0, 5).map((type, idx) => {
            const percentage = ((type.count / totalRecords) * 100).toFixed(1);
            return (
              <div key={idx} className="section-card" style={{ borderLeftColor: type.color }}>
                <div className="section-rank">#{idx + 1}</div>
                <div className="section-info">
                  <div className="section-name">{type.name}</div>
                  <div className="section-count">{type.count.toLocaleString()} records</div>
                  <div className="section-percentage">{percentage}% of total data</div>
                </div>
              </div>
            );
          })}
        </div>

        <h3>All Collections Found</h3>
        <div className="collections-list">
          {repoData.stats.collections.map((collection, idx) => {
            const recordCount = (() => {
              if (collection === 'app.bsky.feed.post') return repoData.stats.posts;
              if (collection === 'app.bsky.feed.like') return repoData.stats.likes;
              if (collection === 'app.bsky.feed.repost') return repoData.stats.reposts;
              if (collection === 'app.bsky.graph.follow') return repoData.stats.follows;
              if (collection === 'app.bsky.graph.block') return repoData.stats.blocks;
              if (collection === 'app.bsky.graph.list') return repoData.stats.lists;
              if (collection === 'app.bsky.graph.listitem') return repoData.stats.listItems;
              return 0;
            })();
            
            return (
              <div key={idx} className="collection-item">
                <span className="collection-name">{collection}</span>
                {recordCount > 0 && (
                  <span className="collection-count">{recordCount.toLocaleString()}</span>
                )}
              </div>
            );
          })}
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

        {/* Top Emojis */}
        {analysis.topEmojis && analysis.topEmojis.length > 0 && (
          <>
            <h4>Top 10 Emojis</h4>
            <div className="top-items-grid">
              {analysis.topEmojis.map((item, idx) => (
                <div key={idx} className="top-item-card">
                  <div className="top-item-rank">#{idx + 1}</div>
                  <div className="top-item-emoji">{item.emoji}</div>
                  <div className="top-item-count">{item.count} uses</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Top Mentions */}
        {analysis.topMentions && analysis.topMentions.length > 0 && (
          <>
            <h4>Top 10 Mentioned Users</h4>
            <div className="top-mentions-list">
              {analysis.topMentions.map((item, idx) => (
                <div key={idx} className="top-mention-item">
                  <div className="mention-rank">#{idx + 1}</div>
                  <div className="mention-did">{item.did}</div>
                  <div className="mention-count">{item.count} mentions</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Other Collections Breakdown */}
        {analysis.otherCollections && Object.keys(analysis.otherCollections).length > 0 && (
          <>
            <h4>Other Collections Breakdown</h4>
            <div className="other-collections-breakdown">
              {Object.entries(analysis.otherCollections)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([type, data], idx) => (
                  <div key={idx} className="other-collection-card">
                    <div className="other-collection-header">
                      <span className="other-collection-type">{type}</span>
                      <span className="other-collection-count">{data.count} records</span>
                    </div>
                    {data.samples.length > 0 && (
                      <details className="other-collection-samples">
                        <summary>View {data.samples.length} sample(s)</summary>
                        <div className="samples-container">
                          {data.samples.map((sample, sIdx) => (
                            <div key={sIdx} className="sample-card">
                              <div className="sample-header">Sample {sIdx + 1}</div>
                              <pre className="sample-json">{JSON.stringify(sample, null, 2)}</pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSamples = () => {
    if (!repoData) return null;

    const sampleSize = 3;

    return (
      <div className="test-section">
        <h3>Sample Records from Each Collection</h3>
        
        {/* Posts Samples */}
        {repoData.records.posts.length > 0 && (
          <div className="sample-section">
            <h4>📝 Posts ({repoData.records.posts.length} total)</h4>
            <div className="samples-container">
              {repoData.records.posts.slice(0, sampleSize).map((post, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1}</div>
                  <pre className="sample-json">{JSON.stringify(post, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Likes Samples */}
        {repoData.records.likes.length > 0 && (
          <div className="sample-section">
            <h4>❤️ Likes ({repoData.records.likes.length} total)</h4>
            <div className="samples-container">
              {repoData.records.likes.slice(0, sampleSize).map((like, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1}</div>
                  <pre className="sample-json">{JSON.stringify(like, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reposts Samples */}
        {repoData.records.reposts.length > 0 && (
          <div className="sample-section">
            <h4>🔄 Reposts ({repoData.records.reposts.length} total)</h4>
            <div className="samples-container">
              {repoData.records.reposts.slice(0, sampleSize).map((repost, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1}</div>
                  <pre className="sample-json">{JSON.stringify(repost, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Follows Samples */}
        {repoData.records.follows.length > 0 && (
          <div className="sample-section">
            <h4>👥 Follows ({repoData.records.follows.length} total)</h4>
            <div className="samples-container">
              {repoData.records.follows.slice(0, sampleSize).map((follow, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1}</div>
                  <pre className="sample-json">{JSON.stringify(follow, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocks Samples */}
        {repoData.records.blocks.length > 0 && (
          <div className="sample-section">
            <h4>🚫 Blocks ({repoData.records.blocks.length} total)</h4>
            <div className="samples-container">
              {repoData.records.blocks.slice(0, sampleSize).map((block, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1}</div>
                  <pre className="sample-json">{JSON.stringify(block, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lists Samples */}
        {repoData.records.lists.length > 0 && (
          <div className="sample-section">
            <h4>📋 Lists ({repoData.records.lists.length} total)</h4>
            <div className="samples-container">
              {repoData.records.lists.slice(0, sampleSize).map((list, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1}</div>
                  <pre className="sample-json">{JSON.stringify(list, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List Items Samples */}
        {repoData.records.listItems.length > 0 && (
          <div className="sample-section">
            <h4>📌 List Items ({repoData.records.listItems.length} total)</h4>
            <div className="samples-container">
              {repoData.records.listItems.slice(0, sampleSize).map((item, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1}</div>
                  <pre className="sample-json">{JSON.stringify(item, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profiles Samples */}
        {repoData.records.profiles.length > 0 && (
          <div className="sample-section">
            <h4>👤 Profiles ({repoData.records.profiles.length} total)</h4>
            <div className="samples-container">
              {repoData.records.profiles.slice(0, sampleSize).map((profile, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1}</div>
                  <pre className="sample-json">{JSON.stringify(profile, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other Samples */}
        {repoData.records.other.length > 0 && (
          <div className="sample-section">
            <h4>🔍 Other Collections ({repoData.records.other.length} total)</h4>
            <div className="samples-container">
              {repoData.records.other.slice(0, sampleSize).map((item, idx) => (
                <div key={idx} className="sample-card">
                  <div className="sample-header">Sample {idx + 1} - {item.type || 'Unknown'}</div>
                  <pre className="sample-json">{JSON.stringify(item, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
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
                className={selectedTab === 'samples' ? 'tab-active' : ''}
                onClick={() => setSelectedTab('samples')}
              >
                Samples
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
              {selectedTab === 'samples' && renderSamples()}
              {selectedTab === 'raw' && renderRaw()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WrappedTest;

