// src/components/Navbar/Navbar.jsx
import React, { useContext, useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../contexts/ThemeContext';
import './Navbar.css';

// Dropdown Menu Component
const DropdownMenu = ({ title, path, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  // Handle click outside to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // Add event listener only when dropdown is open
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  // Add event listener to close dropdown on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (isOpen) {
        setIsOpen(false);
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isOpen]);
  
  // Detect if we're on mobile based on window width
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth <= 940;
  
  // Update window width on resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      // Close dropdown on resize to prevent positioning issues
      if (isOpen) {
        setIsOpen(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);
  
  return (
    <li 
      className={`dropdown-container ${isOpen ? 'active' : ''}`}
      ref={dropdownRef}
      onMouseEnter={() => !isMobile && setIsOpen(true)}
      onMouseLeave={() => !isMobile && setIsOpen(false)}
    >
      <Link 
        to={path} 
        className="dropdown-trigger"
        onClick={(e) => {
          if (isMobile) {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        {title}
      </Link>
      {isOpen && (
        <ul className="dropdown-menu">
          {items.map((item, index) => (
            <li key={index}>
              <Link 
                to={item.path} 
                onClick={() => setIsOpen(false)}
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

// Regular menu item component to ensure consistent styling
const MenuItem = ({ title, path }) => {
  return (
    <li>
      <Link to={path}>{title}</Link>
    </li>
  );
};

const Navbar = () => {
  const { isDarkMode, toggleDarkMode } = useContext(ThemeContext);
  const navigate = useNavigate();

  // Define dropdown menus structure
  const scoreDropdown = {
    title: "score",
    path: "/",
    items: [
      { title: "score", path: "/" },
      { title: "compare", path: "/compare" },
      { title: "leaderboard", path: "/leaderboard" },
      { title: "alt text rating", path: "/alt-text" },
      { title: "activity feed", path: "/collections-feed" },
      { title: "shortcut", path: "/shortcut" }
    ]
  };

  const aboutDropdown = {
    title: "about",
    path: "/about",
    items: [
      { title: "about", path: "/about" },
      { title: "methodology", path: "/methodology" },
      { title: "definitions", path: "/definitions" }
    ]
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <div className="navbar-logo">
            <Link to="/">
              <span className="cred">cred</span>
              <span className="period">.</span>
              <span className="blue">blue</span>
            </Link>
            <div className="beta-badge">
              beta
            </div>
          </div>
          <nav className="navbar-links">
            <ul>
              <DropdownMenu {...scoreDropdown} />
              <DropdownMenu {...aboutDropdown} />
              <MenuItem title="resources" path="/resources" />
            </ul>
          </nav>
        </div>
        <div className="navbar-actions">
          {/* Social Links */}
          <a
            href="https://discord.gg/95ypHb2qPE"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-icon-discord"
            aria-label="Discord Profile"
          >
            <svg className="icon" fill="currentColor">
              <use href="/icons/icons-sprite.svg#icon-discord" />
            </svg>
          </a>
          <a
            href="https://bsky.app/profile/cred.blue"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-icon"
            aria-label="Bluesky Profile"
          >
            <svg className="icon" fill="currentColor">
              <use href="/icons/icons-sprite.svg#icon-bluesky" />
            </svg>
          </a>
          <a
            href="https://github.com/dame-is/cred.blue"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-icon"
            aria-label="GitHub Profile"
          >
            <svg className="icon" fill="currentColor">
              <use href="/icons/icons-sprite.svg#icon-github" />
            </svg>
          </a>
          {/* Theme Toggle */}
          <button
            className="theme-toggle-button"
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
          >
            <svg className="icon" fill="currentColor">
              <use href={`/icons/icons-sprite.svg#icon-${isDarkMode ? 'sun' : 'moon'}`} />
            </svg>
          </button>
          <div className="navbar-support-button-container">
            <button
              className="navbar-support-button"
              type="button"
              onClick={() => navigate(`/supporter`)}
            >
              become a supporter
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;