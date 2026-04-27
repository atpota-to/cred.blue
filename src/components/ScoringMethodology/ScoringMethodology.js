import React from 'react';
import './ScoringMethodology.css';
import ScoreGauge from '../UserProfile/ScoreGauge';
import RelatedPagesNav from '../common/RelatedPagesNav';

const ScoringMethodology = () => {
  return (
    <main className="methodology-page">
      <div className="alt-card">
        <h1>The Scoring Methodology</h1>
        <div className="methodology-page-chart">
          <ScoreGauge score={500} />
        </div>
        <p>Your cred.blue score is generated based on two major categories...</p>
        <h3>1. Bluesky Data</h3>
        <ul className="methodology-list">
          <li>Profile content (avatar, description, etc)</li>
          <li>Posts, likes, lists, etc</li>
          <li>Social graph</li>
          <li>Labelers and moderation</li>
          <li>etc.</li>
        </ul>
        <h3>2. AT Protocol Data</h3>
        <ul className="methodology-list">
          <li>Personal Data Server (PDS)</li>
          <li>Third-party lexicon usage</li>
          <li>Domain name</li>
          <li>PLC logs</li>
          <li>etc.</li>
        </ul>
        <p>
          Separate scores are generated for each category and then combined to produce your final cred.blue score, allowing you to easily see which major category (Bluesky vs AT Proto) has the most impact on your score.
        </p>
        <h2>Score Ranges</h2>
        <p>
          For Version 1 of the scoring algorithm, there is a max score of 1,000 points. This may change in the future, or it could theoretically even be scaled down depending on feedback and usage.
        </p>
        <p>
          A score between 0-300 likely indicates that an account is either very new to the network or isn't very active. A score of 300-700 is within a "healthy" range. Scores that are 700+ typically indicate accounts that have been around awhile and are very active. The different score ranges are still in early development along with the algorithm, so these details are likely to change.
        </p>
        <h2>How do I increase my score?</h2>
        <p>
          The scoring methodology is fairly complex and not all of the variables can be easily changed (for instance, an account's age), but there are some specific actions you can take that can help give you a boost:
        </p>
        <ol className="increase-score-list">
          <li>Fully complete your Bluesky profile</li>
          <li>Focus on posting things people will enjoy or find helpful</li>
          <li>Use more of Bluesky's features</li>
          <li>Add a custom domain name</li>
          <li>Use a third-party PDS</li>
          <li>Remember to add alt text to images</li>
          <li>Add your own rotation key</li>
          <li>Set your pronouns</li>
        </ol>
        <p>
          This is not an exhaustive list by any means, but it should get you started. The goal of the cred.blue score isn't to attempt to max it out... rather, the point is to foster healthy behavior and activity that benefits the entire community.
        </p>

        {/* Replace the old definitions link with the new RelatedPagesNav component */}
        <RelatedPagesNav currentPage="methodology" />
      </div>
    </main>
  );
};

export default ScoringMethodology;