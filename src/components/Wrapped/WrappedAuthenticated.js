import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateWrappedSummary, getYearComparison } from '../../utils/wrappedAnalyzer';

const WrappedAuthenticated = ({ analysis, repoData, did, handle }) => {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const years = Object.keys(analysis.byYear).map(Number).sort().reverse();
  const yearData = analysis.byYear[selectedYear] || {};
  const yearComparison = getYearComparison(analysis, selectedYear);

  return (
    <div className="wrapped-page wrapped-authenticated">
      <div className="wrapped-container">
        {/* Header */}
        <div className="wrapped-header">
          <h1>Your Bluesky Wrapped {currentYear}</h1>
          <p className="wrapped-handle">@{handle || did}</p>
        </div>

        {/* Summary Card */}
        <div className="wrapped-card summary-card animated">
          <h2>Your Year in Review</h2>
          <p className="summary-text">{generateWrappedSummary(analysis)}</p>
        </div>

        {/* Year Selector */}
        {years.length > 1 && (
          <div className="year-selector">
            <label>View stats for:</label>
            <div className="year-buttons">
              {years.map(year => (
                <button
                  key={year}
                  className={selectedYear === year ? 'year-btn active' : 'year-btn'}
                  onClick={() => setSelectedYear(year)}
                >
                  {year}
                </button>
              ))}
              <button
                className={selectedYear === 'all' ? 'year-btn active' : 'year-btn'}
                onClick={() => setSelectedYear('all')}
              >
                All Time
              </button>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="wrapped-stats-grid">
          <div className="wrapped-stat-card animated">
            <div className="stat-number">
              {selectedYear === 'all' ? analysis.overall.totalPosts : yearData.totalPosts || 0}
            </div>
            <div className="stat-label">Posts</div>
            {yearComparison && yearComparison.changes && (
              <div className={`stat-change ${yearComparison.changes.posts >= 0 ? 'positive' : 'negative'}`}>
                {yearComparison.changes.posts >= 0 ? '↑' : '↓'} {Math.abs(yearComparison.changes.posts)}%
              </div>
            )}
          </div>
          
          <div className="wrapped-stat-card animated">
            <div className="stat-number">
              {selectedYear === 'all' ? analysis.overall.totalLikes : yearData.totalLikes || 0}
            </div>
            <div className="stat-label">Likes Given</div>
            {yearComparison && yearComparison.changes && (
              <div className={`stat-change ${yearComparison.changes.likes >= 0 ? 'positive' : 'negative'}`}>
                {yearComparison.changes.likes >= 0 ? '↑' : '↓'} {Math.abs(yearComparison.changes.likes)}%
              </div>
            )}
          </div>
          
          <div className="wrapped-stat-card animated">
            <div className="stat-number">
              {selectedYear === 'all' ? analysis.overall.totalReposts : yearData.totalReposts || 0}
            </div>
            <div className="stat-label">Reposts</div>
            {yearComparison && yearComparison.changes && (
              <div className={`stat-change ${yearComparison.changes.reposts >= 0 ? 'positive' : 'negative'}`}>
                {yearComparison.changes.reposts >= 0 ? '↑' : '↓'} {Math.abs(yearComparison.changes.reposts)}%
              </div>
            )}
          </div>
          
          <div className="wrapped-stat-card animated">
            <div className="stat-number">
              {selectedYear === 'all' ? analysis.overall.totalFollows : yearData.totalFollows || 0}
            </div>
            <div className="stat-label">New Follows</div>
            {yearComparison && yearComparison.changes && (
              <div className={`stat-change ${yearComparison.changes.follows >= 0 ? 'positive' : 'negative'}`}>
                {yearComparison.changes.follows >= 0 ? '↑' : '↓'} {Math.abs(yearComparison.changes.follows)}%
              </div>
            )}
          </div>
        </div>

        {/* Account Age */}
        <div className="wrapped-card milestone-card animated">
          <h2>🎂 Account Milestone</h2>
          <div className="milestone-content">
            <div className="milestone-number">{analysis.overall.accountAgeDays}</div>
            <div className="milestone-label">days on Bluesky</div>
            {analysis.overall.firstPostDate && (
              <div className="milestone-date">
                Member since {new Date(analysis.overall.firstPostDate).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        {/* Posting Patterns */}
        <div className="wrapped-card pattern-card animated">
          <h2>📊 Your Posting Patterns</h2>
          <div className="pattern-grid">
            <div className="pattern-item-large">
              <span className="pattern-icon-large">
                {analysis.patterns.isNightOwl ? '🦉' : analysis.patterns.isEarlyBird ? '🐦' : '☀️'}
              </span>
              <h3>
                {analysis.patterns.isNightOwl 
                  ? 'Night Owl' 
                  : analysis.patterns.isEarlyBird 
                  ? 'Early Bird'
                  : 'Daytime Poster'}
              </h3>
              <p>Most active at {analysis.patterns.mostActiveHour}:00</p>
            </div>
            <div className="pattern-stats">
              <div className="pattern-stat">
                <span className="pattern-label">Favorite Day</span>
                <span className="pattern-value">{analysis.patterns.mostActiveDay}</span>
              </div>
              <div className="pattern-stat">
                <span className="pattern-label">Busiest Month</span>
                <span className="pattern-value">{analysis.patterns.mostActiveMonth}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Breakdown */}
        {selectedYear !== 'all' && yearData.totalPosts > 0 && (
          <div className="wrapped-card content-card animated">
            <h2>📝 Content Breakdown</h2>
            <div className="content-stats">
              <div className="content-stat">
                <div className="content-icon">📸</div>
                <div className="content-info">
                  <div className="content-number">{yearData.postsWithImages || 0}</div>
                  <div className="content-label">Posts with Images</div>
                </div>
              </div>
              <div className="content-stat">
                <div className="content-icon">💬</div>
                <div className="content-info">
                  <div className="content-number">{yearData.postsWithReplies || 0}</div>
                  <div className="content-label">Replies</div>
                </div>
              </div>
              <div className="content-stat">
                <div className="content-icon">🔗</div>
                <div className="content-info">
                  <div className="content-number">{yearData.postsWithLinks || 0}</div>
                  <div className="content-label">Posts with Links</div>
                </div>
              </div>
              <div className="content-stat">
                <div className="content-icon">✍️</div>
                <div className="content-info">
                  <div className="content-number">{yearData.avgPostLength || 0}</div>
                  <div className="content-label">Avg Characters</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top Posts */}
        {analysis.topContent && analysis.topContent.recentPosts && analysis.topContent.recentPosts.length > 0 && (
          <div className="wrapped-card posts-card animated">
            <h2>🌟 Your Recent Posts</h2>
            <div className="posts-list">
              {analysis.topContent.recentPosts.slice(0, 5).map((post, idx) => (
                <div key={idx} className="post-item">
                  <div className="post-header">
                    <span className="post-date">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                    {post.reply && <span className="post-badge">Reply</span>}
                    {post.embed && <span className="post-badge">Media</span>}
                  </div>
                  <div className="post-text">
                    {post.text || '(no text)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fun Facts */}
        <div className="wrapped-card fun-facts-card animated">
          <h2>✨ Fun Facts About You</h2>
          <div className="fun-facts-list">
            {analysis.funFacts.map((fact, idx) => (
              <div key={idx} className="fun-fact-item-auth">
                <span className="fun-fact-icon">💫</span>
                <span className="fun-fact-text">{fact}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Social Activity */}
        {analysis.social && (
          <div className="wrapped-card social-card animated">
            <h2>👥 Social Activity</h2>
            <div className="social-stats">
              <div className="social-stat">
                <div className="social-number">{analysis.social.totalFollows}</div>
                <div className="social-label">Total Follows</div>
              </div>
              <div className="social-stat">
                <div className="social-number">{analysis.social.totalLists}</div>
                <div className="social-label">Lists Created</div>
              </div>
              <div className="social-stat">
                <div className="social-number">{analysis.social.followsPerDay}</div>
                <div className="social-label">Follows/Day</div>
              </div>
            </div>
          </div>
        )}

        {/* Year by Year Timeline */}
        {years.length > 1 && (
          <div className="wrapped-card timeline-card animated">
            <h2>📅 Your Journey</h2>
            <div className="timeline">
              {years.map(year => {
                const data = analysis.byYear[year];
                return (
                  <div key={year} className="timeline-item">
                    <div className="timeline-year">{year}</div>
                    <div className="timeline-content">
                      <div className="timeline-stat">
                        {data.totalPosts} posts • {data.totalLikes} likes • {data.totalFollows} follows
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Share CTA */}
        <div className="wrapped-card share-card animated">
          <h2>Share Your Wrapped</h2>
          <p>Show off your Bluesky year!</p>
          <div className="share-buttons">
            <button className="btn-share" onClick={() => {
              const url = `https://cred.blue/wrapped/${handle || did}`;
              navigator.clipboard.writeText(url);
              alert('Link copied to clipboard!');
            }}>
              📋 Copy Link
            </button>
            <button className="btn-share" onClick={() => {
              const text = `Check out my Bluesky Wrapped ${currentYear}! ${generateWrappedSummary(analysis)}`;
              const url = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
              window.open(url, '_blank');
            }}>
              🦋 Share on Bluesky
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="wrapped-footer">
          <p>Made with 💙 by cred.blue</p>
          <button onClick={() => navigate('/home')} className="btn-link">
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default WrappedAuthenticated;

