import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, authLoading } = useAuth(); // Assuming 'authLoading' is the correct name from context
  const location = useLocation();

  if (authLoading) {
    // Optional: Display a loading indicator while checking auth status
    return <div>Loading authentication status...</div>;
  }

  if (!isAuthenticated) {
    // User not logged in, redirect to login page
    // Preserve the original intended location in the state
    return <Navigate to={`/login?returnUrl=${location.pathname}${location.search}`} replace />;
  }

  // User is authenticated, render the child component
  return children;
};

export default ProtectedRoute; 