import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isAccountAllowed } from '../config/allowlist';
import Loading from './Loading/Loading';

// Component to protect routes that require authentication
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, session } = useAuth();
  const location = useLocation();

  // Show loading state while authentication is being determined by AuthProvider
  if (loading) {
    console.log("ProtectedRoute: Waiting for AuthProvider loading...");
    return <Loading message="Loading authentication status..." />;
  }

  // If not authenticated after loading, redirect to login with return URL
  if (!isAuthenticated) {
    console.log("ProtectedRoute: Not authenticated after loading, redirecting to login");
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  // Check if user is allowed (allowlist check remains)
  if (session && session.handle && !isAccountAllowed(session)) {
    console.log("ProtectedRoute: User not in allowlist, redirecting to supporter page");
    return <Navigate to="/supporter" replace />;
  }

  // Render children if authenticated and allowed
  console.log(`ProtectedRoute: Authentication successful (${session?.handle}), rendering protected content for ${location.pathname}`);
  return children;
};

export default ProtectedRoute; 