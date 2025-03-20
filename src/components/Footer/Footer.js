// src/components/Footer/Footer.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        {/* Important Links */}
        <div className="footer-links">
          <Link to="/newsletter">Newsletter</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
          <a
            href="https://bsky.app/profile/dame.is"
            target="_blank"
            rel="noopener noreferrer"
            className="credit-link-anchor"
          >
            Made by @dame.is
          </a>
          <Link to="/zen" className="zen-link">Zen</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;