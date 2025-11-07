import React from 'react';
import { useNavigate } from 'react-router-dom';
import { generateWrappedSummary } from '../../utils/wrappedAnalyzer';

const WrappedPublic = ({ analysis, repoData, did, handle, isAuthenticated }) => {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const thisYearData = analysis.byYear[currentYear] || {};

  const handleSignIn = () => {
    navigate(`/login?returnUrl=/wrapped/${handle || did}`);
  };

  return (
    <div className="wrapped-page">
      <div className="wrapped-container">
        {/* Header */}
        <div className="wrapped-header">
          <h1>Bluesky Wrapped {currentYear}</h1>
          <p className="wrapped-handle">@{handle || did}</p>
        </div>

        {/* Summary Card */}
        <div className="wrapped-card summary-card">
          <h2>Your Year on Bluesky</h2>
          <p className="summary-text">{generateWrappedSummary(analysis)}</p>
        </div>

        {/* Stats Grid */}
        <div className="wrapped-stats-grid">
          <div className="wrapped-stat-card">
            <div className="stat-number">{thisYearData.totalPosts || analysis.overall.totalPosts}</div>
            <div className="stat-label">Posts in {currentYear}</div>
          </div>
          <div className="wrapped-stat-card">
            <div className="stat-number">{thisYearData.totalLikes || analysis.overall.totalLikes}</div>
            <div className="stat-label">Likes Given</div>
          </div>
          <div className="wrapped-stat-card">
            <div className="stat-number">{thisYearData.totalFollows || analysis.overall.totalFollows}</div>
            <div className="stat-label">New Follows</div>
          </div>
          <div className="wrapped-stat-card">
            <div className="stat-number">{analysis.overall.accountAgeDays}</div>
            <div className="stat-label">Days on Bluesky</div>
          </div>
        </div>

        {/* Posting Pattern */}
        {analysis.patterns && (
          <div className="wrapped-card pattern-card">
            <h2>Your Posting Style</h2>
            <div className="pattern-info">
              <div className="pattern-item">
                <span className="pattern-icon">
                  {analysis.patterns.isNightOwl ? '🦉' : analysis.patterns.isEarlyBird ? '🐦' : '☀️'}
                </span>
                <span className="pattern-text">
                  {analysis.patterns.isNightOwl 
                    ? 'Night Owl - Most active late at night' 
                    : analysis.patterns.isEarlyBird 
                    ? 'Early Bird - Most active in the morning'
                    : 'Daytime Poster - Most active during the day'}
                </span>
              </div>
              <div className="pattern-item">
                <span className="pattern-label">Most Active Day:</span>
                <span className="pattern-value">{analysis.patterns.mostActiveDay}</span>
              </div>
              <div className="pattern-item">
                <span className="pattern-label">Most Active Month:</span>
                <span className="pattern-value">{analysis.patterns.mostActiveMonth}</span>
              </div>
            </div>
          </div>
        )}

        {/* Top Posts Preview */}
        {analysis.topContent && analysis.topContent.recentPosts && analysis.topContent.recentPosts.length > 0 && (
          <div className="wrapped-card posts-preview-card">
            <h2>Recent Posts</h2>
            <div className="posts-preview">
              {analysis.topContent.recentPosts.slice(0, 3).map((post, idx) => (
                <div key={idx} className="post-preview-item">
                  <div className="post-date">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </div>
                  <div className="post-text">
                    {post.text && post.text.length > 150 
                      ? post.text.substring(0, 150) + '...' 
                      : post.text || '(no text)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fun Facts Preview */}
        {analysis.funFacts && analysis.funFacts.length > 0 && (
          <div className="wrapped-card fun-facts-card">
            <h2>Quick Facts</h2>
            <div className="fun-facts-preview">
              {analysis.funFacts.slice(0, 3).map((fact, idx) => (
                <div key={idx} className="fun-fact-item">
                  ✨ {fact}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sign In CTA */}
        {!isAuthenticated && (
          <div className="wrapped-card cta-card">
            <h2>Want to See Your Full Wrapped?</h2>
            <p>Sign in to unlock:</p>
            <ul className="cta-features">
              <li>📊 Detailed year-over-year comparisons</li>
              <li>📈 Growth metrics and trends</li>
              <li>🎯 All your top posts and interactions</li>
              <li>🎨 Personalized insights and fun facts</li>
              <li>💾 Save and share your wrapped</li>
            </ul>
            <button onClick={handleSignIn} className="btn-signin">
              Sign In with Bluesky
            </button>
          </div>
        )}

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

export default WrappedPublic;

