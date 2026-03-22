import React from 'react';

export default function AdminPlaceholder({ title, icon, description }) {
  return (
    <div>
      <h1 style={{
        fontFamily: "'Cormorant Garamond', serif", fontSize: 28,
        color: '#1a0a0a', margin: '0 0 8px',
      }}>
        {icon} {title}
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 32 }}>
        {description ?? 'This module is being built.'}
      </p>
      <div style={{
        background: '#fff', border: '2px dashed rgba(0,0,0,0.1)',
        borderRadius: 12, padding: '48px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 8 }}>
          {title} — Coming next
        </div>
        <div style={{ fontSize: 13, color: '#999', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
          This module will be implemented in the next build step. The database schema and
          API routes are ready — the UI just needs wiring up.
        </div>
      </div>
    </div>
  );
}
