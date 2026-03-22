import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { FiActivity, FiBarChart2, FiBookOpen, FiClipboard, FiGrid, FiImage, FiMic, FiShield, FiTag, FiTool, FiTruck } from 'react-icons/fi';

// ── Nav items ──────────────────────────────────────────────────────────────

const NAV = [
  {
    section: 'Overview',
    items: [
      { path: '/admin',          label: 'Dashboard',       icon: <FiBarChart2 />, exact: true },
    ],
  },
  {
    section: 'Data Pipeline',
    items: [
      { path: '/admin/scraper',  label: 'Scraper Control', icon: <FiTool /> },
      { path: '/admin/labelling',label: 'Labelling Queue', icon: <FiTag /> },
      { path: '/admin/model',    label: 'Model Training',  icon: <FiActivity /> },
    ],
  },
  {
    section: 'Cost Data',
    items: [
      { path: '/admin/artists',  label: 'Artists',         icon: <FiMic /> },
      { path: '/admin/fb',       label: 'F&B Rates',       icon: <FiGrid /> },
      { path: '/admin/logistics',label: 'Logistics',       icon: <FiTruck /> },
      { path: '/admin/cities',   label: 'Cities',          icon: <FiGrid /> },
      { path: '/admin/decor',    label: 'Decor Library',   icon: <FiBookOpen /> },
    ],
  },
  {
    section: 'System',
    items: [
      { path: '/admin/content',  label: 'Website Content', icon: <FiImage /> },
      { path: '/admin/audit',    label: 'Audit Log',       icon: <FiClipboard /> },
    ],
  },
];

// ── Styles ─────────────────────────────────────────────────────────────────

const SIDEBAR_W = 240;
const HEADER_H  = 56;

const S = {
  root: {
    display: 'flex', minHeight: '100vh',
    background: '#f5f0eb', fontFamily: "'Jost', sans-serif",
  },
  sidebar: {
    width: SIDEBAR_W, minHeight: '100vh', flexShrink: 0,
    background: '#1a0a0a', display: 'flex', flexDirection: 'column',
    position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
    overflowY: 'auto',
  },
  logo: {
    padding: '20px 20px 16px',
    borderBottom: '1px solid rgba(232,201,122,0.12)',
  },
  logoText: {
    fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700,
    color: '#E8C97A', letterSpacing: 1,
  },
  logoSub: {
    fontSize: 9, letterSpacing: '2px', textTransform: 'uppercase',
    color: 'rgba(232,201,122,0.35)', marginTop: 2,
  },
  nav: { flex: 1, padding: '12px 0' },
  section: {
    padding: '16px 20px 6px',
    fontSize: 9, letterSpacing: '2px', textTransform: 'uppercase',
    color: 'rgba(232,201,122,0.3)', fontWeight: 600,
  },
  navLink: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 20px', margin: '1px 8px', borderRadius: 8,
    textDecoration: 'none', fontSize: 13, fontWeight: 500,
    color: 'rgba(232,201,122,0.55)', transition: 'all 0.15s',
    cursor: 'pointer',
  },
  navLinkActive: {
    background: 'rgba(232,201,122,0.1)', color: '#E8C97A',
  },
  navIcon: { fontSize: 15, width: 20, textAlign: 'center' },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid rgba(232,201,122,0.12)',
  },
  footerName: { fontSize: 12, color: 'rgba(232,201,122,0.6)', marginBottom: 8 },
  footerRole: {
    display: 'inline-block', fontSize: 9, letterSpacing: '1.5px',
    textTransform: 'uppercase', background: 'rgba(122,28,28,0.6)',
    color: '#E8C97A', padding: '2px 8px', borderRadius: 4, marginBottom: 12,
  },
  signOut: {
    width: '100%', padding: '8px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(232,201,122,0.15)', borderRadius: 8,
    color: 'rgba(232,201,122,0.5)', fontSize: 12, cursor: 'pointer',
    fontFamily: "'Jost', sans-serif", transition: 'all 0.15s',
  },
  main: {
    marginLeft: SIDEBAR_W, flex: 1, display: 'flex', flexDirection: 'column',
    minHeight: '100vh',
  },
  header: {
    height: HEADER_H, background: '#fff',
    borderBottom: '1px solid rgba(0,0,0,0.07)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 28px', position: 'sticky', top: 0, zIndex: 50,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  headerTitle: {
    fontFamily: "'Cormorant Garamond', serif", fontSize: 20,
    color: '#2a1010', fontWeight: 700,
  },
  headerMeta: { display: 'flex', alignItems: 'center', gap: 16 },
  headerBadge: {
    fontSize: 11, padding: '4px 12px', borderRadius: 20,
    background: 'rgba(122,28,28,0.08)', color: '#7a1c1c', fontWeight: 600,
    letterSpacing: '0.5px',
  },
  content: { flex: 1, padding: '28px', maxWidth: 1200, width: '100%' },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const { profile, isSuperAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    navigate('/admin/login');
  }

  return (
    <div style={S.root}>
      {/* ── Sidebar ── */}
      <aside style={S.sidebar}>
        <div style={S.logo}>
          <div style={S.logoText}>
            WeddingBudget<span>.ai</span>
          </div>
          <div style={S.logoSub}>Admin Console</div>
        </div>

        <nav style={S.nav}>
          {NAV.map(group => (
            <div key={group.section}>
              <div style={S.section}>{group.section}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.exact}
                  style={({ isActive }) => ({
                    ...S.navLink,
                    ...(isActive ? S.navLinkActive : {}),
                  })}
                >
                  <span style={S.navIcon}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div style={S.footer}>
          <div style={S.footerName}>{profile?.full_name ?? profile?.email ?? 'Admin'}</div>
          <div style={S.footerRole}>{isSuperAdmin ? 'Super Admin' : 'Admin'}</div>
          <button
            style={S.signOut}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : '→  Sign out'}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={S.main}>
        <header style={S.header}>
          <div style={S.headerTitle}>Events by Athea</div>
          <div style={S.headerMeta}>
            <span style={S.headerBadge}><FiShield style={{ verticalAlign: 'middle', marginRight: 6 }} />Admin</span>
            <span style={{ fontSize: 12, color: '#999' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })}
            </span>
          </div>
        </header>

        <div style={S.content}>
          {/* Child route renders here */}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
