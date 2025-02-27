import React, { useState } from 'react';
import './ScoringMethodology.css';
import ScoreGauge from '../UserProfile/ScoreGauge';

const ScoringMethodology = () => {
  // State to track which definition is expanded
  const [expandedTerm, setExpandedTerm] = useState(null);
  // State to track which social status is expanded
  const [expandedStatus, setExpandedStatus] = useState(null);

  // Toggle function for definitions accordion
  const toggleTerm = (term) => {
    if (expandedTerm === term) {
      setExpandedTerm(null);
    } else {
      setExpandedTerm(term);
    }
  };

  // Toggle function for social status accordion
  const toggleStatus = (status) => {
    if (expandedStatus === status) {
      setExpandedStatus(null);
    } else {
      setExpandedStatus(status);
    }
  };

  // Definitions data with added links
  const definitions = [
    {
      id: "pds",
      term: "Personal Data Server (PDS)",
      definition: "A server that hosts your AT Protocol data and content. You can use Bluesky's PDS hosting or choose a third-party PDS host for more control over your data. By default, new Bluesky accounts use Bluesky's PDS hosting, so the vast majority of accounts right now do not use a third-party PDS. Having a third-party PDS host contributes to the further decentralization of the network, but it is currently difficult to do.",
      learnMoreLink: "https://atproto.com/guides/pds"
    },
    {
      id: "did",
      term: "DID",
      definition: "The AT Protocol uses Decentralized Identifiers (DIDs) as persistent, long-term account identifiers. DID is a W3C standard, with many standardized and proposed DID method implementations. There are currently two methods supported by the protocol: did:plc and did:web. New Bluesky accounts use the did:plc method.",
      learnMoreLink: "https://atproto.com/specs/did"
    },
    {
      id: "lexicon",
      term: "Lexicon",
      definition: "The schema system used by the AT Protocol to define data structures. Lexicons are kind of like a file formats, and different AT Protocol apps can choose which of these file formats to support. Apps can have their own unique file formats as well. Third-party lexicons allow for custom features and extensions to the protocol.",
      learnMoreLink: "https://atproto.com/guides/lexicon"
    },
    {
      id: "rotation-key",
      term: "Rotation Key",
      definition: "A security feature that allows you to recover your account if your primary credentials are compromised.",
      learnMoreLink: "https://bsky.app/profile/mattyoukhana.xyz/post/3ke5j53mxwt2o"
    },
    {
      id: "alt-text",
      term: "Alt Text",
      definition: "Text descriptions added to images that make content accessible to users with visual impairments or when images fail to load.",
      learnMoreLink: "https://help.bsky.app/en/articles/8754485-how-do-i-add-alt-text-to-my-images"
    },
    {
      id: "social-graph",
      term: "Social Graph",
      definition: "The network of connections between accounts, including followers, following, and engagement patterns.",
      learnMoreLink: "https://atproto.com/lexicons/app-bsky-graph"
    },
    {
      id: "labelers",
      term: "Labelers",
      definition: "Entities that can apply labels to content on Bluesky for moderation purposes. Users can choose which labelers they trust.",
      learnMoreLink: "https://bsky.social/about/blog/5-22-24-content-labeling-moderation"
    },
    {
      id: "engagement-rate",
      term: "Engagement Rate",
      definition: "A metric that measures how much interaction your content receives relative to your audience size.",
      learnMoreLink: "https://cred.blue/methodology"
    }
  ];

  // Social status data with added links
  const socialStatuses = [
    {
      id: "newcomer",
      name: "Newcomer",
      description: "Accounts that are new to Bluesky or have minimal activity. These users are just getting started on the platform and beginning to build their presence. After 30 days, Newcomers become Explorers.",
      learnMoreLink: "https://cred.blue/social-status/newcomer"
    },
    {
      id: "explorer",
      name: "Explorer",
      description: "Users who are actively engaging with the platform, discovering features, and building their initial network. They have established a basic presence but are still growing their connections and potentially finding their community.",
      learnMoreLink: "https://cred.blue/social-status/explorer"
    },
    {
      id: "pathfinder",
      name: "Pathfinder",
      description: "Established users who have developed a consistent presence and are actively contributing to conversations. These accounts have a growing influence (1,000+ followers) and solid engagement within their communities.",
      learnMoreLink: "https://cred.blue/social-status/pathfinder"
    },
    {
      id: "guide",
      name: "Guide",
      description: "Well-established users who have significant influence within specific communities (10,000+ followers). They often create valuable content and maintain strong engagement with their followers.",
      learnMoreLink: "https://cred.blue/social-status/guide"
    },
    {
      id: "leader",
      name: "Leader",
      description: "Highly influential accounts with substantial followings (100,000+) and engagement. These users have a broad impact across multiple communities and consistently contribute high-value content to the platform.",
      learnMoreLink: "https://cred.blue/social-status/leader"
    }
  ];

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
          This is not an exhaustive list by any means, but it should get you started. The goal of the cred.blue score isn't to attempt to max it out... rather, the point is to foster healthy behavior and activity that benefits the
          entire community.
        </p>
        
        <h2>What are the different social statuses?</h2>
        <p>
          Rather than displaying follower counts on profiles, the cred.blue analysis categorizes each identity into one of five social statuses based on its follower count, social graph ratio, engagement rate, and age. There are additional labels placed before the social status to indicate how engaging the account actually is.
        </p>
        <div className="social-statuses-container definitions-container">
          {socialStatuses.map((status) => (
            <div key={status.id} className="definition-item">
              <dt 
                className="definition-term" 
                onClick={() => toggleStatus(status.id)}
                role="button"
                aria-expanded={expandedStatus === status.id}
              >
                {status.name}
                {expandedStatus === status.id ? 
                  <span className="toggle-icon" aria-hidden="true">−</span> : 
                  <span className="toggle-icon" aria-hidden="true">+</span>
                }
              </dt>
              <dd 
                className={`definition-description ${expandedStatus === status.id ? 'expanded' : ''}`}
                aria-hidden={expandedStatus !== status.id}
              >
                {status.description}
                {status.learnMoreLink && (
                  <div className="learn-more-link">
                    <a 
                      href={status.learnMoreLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      Learn more about {status.name} status →
                    </a>
                  </div>
                )}
              </dd>
            </div>
          ))}
        </div>
        
        <h2>Key Terms and Definitions</h2>
        <div className="definitions-container">
          {definitions.map((item) => (
            <div key={item.id} className="definition-item">
              <dt 
                className="definition-term" 
                onClick={() => toggleTerm(item.id)}
                role="button"
                aria-expanded={expandedTerm === item.id}
              >
                {item.term}
                {expandedTerm === item.id ? 
                  <span className="toggle-icon" aria-hidden="true">−</span> : 
                  <span className="toggle-icon" aria-hidden="true">+</span>
                }
              </dt>
              <dd 
                className={`definition-description ${expandedTerm === item.id ? 'expanded' : ''}`}
                aria-hidden={expandedTerm !== item.id}
              >
                {item.definition}
                {item.learnMoreLink && (
                  <div className="learn-more-link">
                    <a 
                      href={item.learnMoreLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      Learn more about {item.term} →
                    </a>
                  </div>
                )}
              </dd>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
};

export default ScoringMethodology;