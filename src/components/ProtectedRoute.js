import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isAccountAllowed } from '../config/allowlist';
import Loading from './Loading/Loading';

// Component to protect routes that require authentication
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, session } = useAuth();

  // Show loading state while authentication is being checked
  if (loading) {
    return <Loading message="Checking authentication..." />;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If authenticated but not allowed, redirect to supporter page
  if (!isAccountAllowed(session)) {
    return <Navigate to="/supporter" replace />;
  }

  // Render children if authenticated and allowed
  return children;
};

export default ProtectedRoute; 