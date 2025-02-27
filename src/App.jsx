import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import Newsletter from './components/Newsletter/Newsletter';
import About from './components/About/About';
import Home from './components/Home/Home';
import Leaderboard from './components/Leaderboard/Leaderboard';
import Supporter from './components/Supporter/Supporter';
import Shortcut from './components/Shortcut/Shortcut';
import Resources from './components/Resources/Resources';
import ResourceSubmission from './components/Resources/ResourceSubmission';
import ScoringMethodology from './components/ScoringMethodology/ScoringMethodology';
import Terms from './components/PrivacyTerms/Terms';
import Privacy from './components/PrivacyTerms/Privacy';
import AltTextRatingTool from './components/AltTextRating/AltTextRatingTool';
import UserProfile from './components/UserProfile/UserProfile';
import ZenPage from './components/ZenPage';
import CompareScores from './components/CompareScores/CompareScores';
import "./App.css";

const App = () => {
  return (
    <>
      <Router>
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Navbar />
          <div className="main-container" style={{ flex: 1 }}>
          <Routes>
            {/* All routes are now public */}
            <Route path="/home" element={<Home />} />
            <Route path="/compare/:username1/:username2" element={<CompareScores />} />
            <Route path="/compare" element={<CompareScores />} />
            <Route path="/alt-text" element={<AltTextRatingTool />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/newsletter" element={<Newsletter />} />
            <Route path="/supporter" element={<Supporter />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/resources/submit" element={<ResourceSubmission />} />
            <Route path="/shortcut" element={<Shortcut />} />
            <Route path="/zen" element={<ZenPage />} />
            <Route path="/methodology" element={<ScoringMethodology />} />
            {/* Handle both DIDs and regular usernames */}
            <Route path="/:username" element={<UserProfile />} />
            {/* Default routes */}
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
          </div>
          <Footer />
        </div>
      </Router>
      <Analytics />
    </>
  );
};

export default App;