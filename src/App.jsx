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
import Definitions from './components/Definitions/Definitions';
import Shortcut from './components/Shortcut/Shortcut';
import Resources from './components/Resources/Resources';
import ScoringMethodology from './components/ScoringMethodology/ScoringMethodology';
import Terms from './components/PrivacyTerms/Terms';
import Privacy from './components/PrivacyTerms/Privacy';
import AltTextRatingTool from './components/AltTextRating/AltTextRatingTool';
import UserProfile from './components/UserProfile/UserProfile';
import ZenPage from './components/ZenPage';
import CompareScores from './components/CompareScores/CompareScores';
import CollectionsFeed from './components/CollectionsFeed/CollectionsFeed';
import Login from './components/Login/Login';
import LoginCallback from './components/Login/LoginCallback';
import Verifier from './components/Verifier/Verifier';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import "./App.css";

const App = () => {
  return (
    <>
      <AuthProvider>
        <Router>
          <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Navbar />
            <div className="main-container" style={{ flex: 1 }}>
              <Routes>
                {/* Auth Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/login/callback" element={<LoginCallback />} />
                
                {/* Public Routes */}
                <Route path="/home" element={<Home />} />
                <Route path="/compare/:username1/:username2" element={<CompareScores />} />
                <Route path="/compare" element={<CompareScores />} />
                <Route path="/alt-text" element={<AltTextRatingTool />} />
                <Route path="/about" element={<About />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/newsletter" element={<Newsletter />} />
                <Route path="/supporter" element={<Supporter />} />
                <Route path="/definitions" element={<Definitions />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/resources" element={<Resources />} />
                <Route 
                  path="/verifier" 
                  element={
                    <ProtectedRoute>
                      <Verifier />
                    </ProtectedRoute>
                  } 
                />
                <Route path="/shortcut" element={<Shortcut />} />
                <Route path="/zen" element={<ZenPage />} />
                <Route path="/methodology" element={<ScoringMethodology />} />
                
                {/* Omnifeed Routes - Temporarily Commented Out */}
                {/*
                <Route
                  path="/omnifeed/:username"
                  element={<CollectionsFeed />}
                />
                <Route
                  path="/omnifeed"
                  element={<CollectionsFeed />}
                />
                */}
                
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
      </AuthProvider>
      <Analytics />
    </>
  );
};

export default App;