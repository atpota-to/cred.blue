import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isAccountAllowed } from '../config/allowlist';
import Loading from './Loading/Loading';

// Component to protect routes that require authentication
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, session } = useAuth();
  const location = useLocation();

  // Show loading state while authentication context is initializing
  if (loading) {
    return <Loading message="Checking authentication..." />;
  }

  // If not authenticated after loading, redirect to login
  if (!isAuthenticated) {
    console.log("ProtectedRoute: Not authenticated, redirecting to login");
    const returnUrl = encodeURIComponent(location.pathname + location.search); // Include search params
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  // Check if user is allowed
  if (session && session.handle && !isAccountAllowed(session)) {
    console.log("ProtectedRoute: User not in allowlist, redirecting to supporter page");
    return <Navigate to="/supporter" replace />;
  }

  // Render children if authenticated and allowed
  console.log("ProtectedRoute: Authentication successful, rendering protected content");
  return children;
};

export default ProtectedRoute; 