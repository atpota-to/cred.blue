import React from 'react';
import './PrivacyTerms.css';

const Terms = () => {
  return (
    <>
      <main className="privacy-terms-page">
        <div className="alt-card">
          <h1>Terms of Service</h1>
          <div className="last-updated">Last Updated: May 15, 2025</div>

          <div className="section">
            <h2>1. Acceptance of Terms</h2>
            <p>By accessing or using cred.blue ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these terms, you may not access the Service.</p>
          </div>

          <div className="section">
            <h2>2. Description of Service</h2>
            <p>cred.blue provides:</p>
            <ul>
              <li>Analysis of public Bluesky user data</li>
              <li>scoring based on public information</li>
              <li>Enhanced tools for authenticated Bluesky users</li>
              <li>Optional email updates and notifications</li>
              <li>Storage and analysis of public user data to improve service quality</li>
            </ul>
          </div>

          <div className="section">
            <h2>3. User Responsibilities</h2>
            <p>You agree to:</p>
            <ul>
              <li>Use the Service in compliance with all applicable laws</li>
              <li>Not use the Service to harass, abuse, or harm others</li>
              <li>Not attempt to access non-public data or bypass security measures</li>
              <li>Understand that public data associated with searched accounts will be stored and analyzed</li>
            </ul>
          </div>

          <div className="section">
            <h2>4. Data Collection and Usage</h2>
            <ul>
              <li>We collect and store copies of public Bluesky data when usernames are searched or scores are generated</li>
              <li>Stored data is used to improve our services, provide analytics, and develop new features</li>
              <li>We maintain appropriate security measures to protect stored data</li>
              <li>We do not collect or store private or protected Bluesky data</li>
            </ul>
          </div>

          <div className="section">
            <h2>5. Account Terms</h2>
            <ul>
              <li>Authentication is handled through Bluesky's system</li>
              <li>You are responsible for maintaining the security of your Bluesky credentials</li>
              <li>We reserve the right to terminate access to enhanced features at our discretion</li>
            </ul>
          </div>

          <div className="section">
            <h2>6. Disclaimer of Warranties</h2>
            <ul>
              <li>The Service is provided "as is" without warranties of any kind</li>
              <li>We do not guarantee the accuracy of scores or analytics</li>
              <li>We are not responsible for the accuracy of public Bluesky data</li>
              <li>We do not guarantee the availability or retention period of stored data</li>
            </ul>
          </div>

          <div className="section">
            <h2>7. Limitation of Liability</h2>
            <p>We shall not be liable for:</p>
            <ul>
              <li>Any indirect, incidental, or consequential damages</li>
              <li>Decisions made based on scores or analytics</li>
              <li>Temporary service interruptions or data unavailability</li>
              <li>Any issues arising from our storage or analysis of public data</li>
            </ul>
          </div>

          <div className="section">
            <h2>8. Modifications to Service</h2>
            <p>We reserve the right to:</p>
            <ul>
              <li>Modify or discontinue any part of the Service</li>
              <li>Update these Terms at any time</li>
              <li>Change our scoring algorithms and methodologies</li>
              <li>Modify our data collection and retention practices</li>
            </ul>
          </div>

          <div className="contact">
            <h2>9. Contact Information</h2>
            <p>For questions about these Terms, please contact us at terms@cred.blue</p>
          </div>
        </div>
      </main>
    </>
  );
};

export default Terms;