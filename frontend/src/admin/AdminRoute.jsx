import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Wraps any route that requires admin access.
 * - Still loading  → show spinner
 * - Not logged in  → redirect to /admin/login
 * - Logged in but not admin → redirect to /admin/login with a message
 * - Admin          → render children
 */
export default function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#1a0a0a',
        fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#E8C97A',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👑</div>
          <div>Verifying credentials…</div>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    // Preserve intended destination so we can redirect back after login
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return children;
}
