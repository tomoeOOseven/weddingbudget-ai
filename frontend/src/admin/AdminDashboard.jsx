import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

function StatCard({ icon, label, value, sub, onClick, color = '#7a1c1c' }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 12, padding: '20px 24px', cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s', flex: 1, minWidth: 160,
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "'Cormorant Garamond', serif" }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function QuickAction({ icon, label, desc, path }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(path)}
      style={{
        background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 12, padding: '20px', cursor: 'pointer',
        transition: 'all 0.2s', display: 'flex', gap: 16, alignItems: 'flex-start',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
        e.currentTarget.style.borderColor = 'rgba(122,28,28,0.3)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)';
      }}
    >
      <div style={{ fontSize: 28, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1a0a0a', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [recentJobs, setRecentJobs] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [
          { count: totalImages },
          { count: labelledImages },
          { count: pendingLabels },
          { count: totalArtists },
          { data: modelData },
          { data: jobs },
        ] = await Promise.all([
          supabase.from('scraped_images').select('*', { count: 'exact', head: true }),
          supabase.from('scraped_images').select('*', { count: 'exact', head: true }).eq('status', 'labelled'),
          supabase.from('scraped_images').select('*', { count: 'exact', head: true }).eq('status', 'raw'),
          supabase.from('artists').select('*', { count: 'exact', head: true }),
          supabase.from('model_versions').select('version_label, r2_min, trained_at').eq('is_active', true).limit(1),
          supabase.from('scrape_jobs').select('id, status, images_saved, created_at, scrape_sources(name)')
            .order('created_at', { ascending: false }).limit(5),
        ]);

        setStats({ totalImages, labelledImages, pendingLabels, totalArtists, activeModel: modelData?.[0] });
        setRecentJobs(jobs ?? []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Admin';

  const statusColor = { completed: '#16a34a', failed: '#dc2626', running: '#d97706', pending: '#6b7280' };

  return (
    <div>
      {/* Greeting */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: '#1a0a0a', margin: 0 }}>
          {greeting}, {firstName} 👋
        </h1>
        <p style={{ color: '#888', fontSize: 13, margin: '6px 0 0' }}>
          Here's the current state of WeddingBudget.ai's data pipeline.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <StatCard icon="🖼️" label="Total Scraped Images" value={loading ? '…' : stats.totalImages?.toLocaleString()} sub="across all sources" onClick={() => navigate('/admin/scraper')} />
        <StatCard icon="🏷️" label="Labelled Images" value={loading ? '…' : stats.labelledImages?.toLocaleString()} sub="ready for training" color="#15803d" onClick={() => navigate('/admin/labelling')} />
        <StatCard icon="⏳" label="Pending Labels" value={loading ? '…' : stats.pendingLabels?.toLocaleString()} sub="awaiting review" color="#b45309" onClick={() => navigate('/admin/labelling')} />
        <StatCard icon="🧠" label="Active Model" value={loading ? '…' : (stats.activeModel?.version_label ?? 'None')} sub={stats.activeModel ? `R² ${stats.activeModel.r2_min ?? '—'}` : 'No model trained yet'} onClick={() => navigate('/admin/model')} />
      </div>

      {/* Quick actions + recent jobs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
        {/* Quick actions */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a0a0a', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Quick Actions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <QuickAction icon="🕷️" label="Run Scraper" desc="Trigger a manual scrape on any tracked site or all sites at once." path="/admin/scraper" />
            <QuickAction icon="🏷️" label="Label Images" desc="Review untagged images. Use AI auto-tag or label manually." path="/admin/labelling" />
            <QuickAction icon="🔁" label="Retrain Model" desc="Kick off a new training run with the latest labelled dataset." path="/admin/model" />
            <QuickAction icon="🎤" label="Update Artist Costs" desc="Edit fee ranges for artists. All changes are version-controlled." path="/admin/artists" />
          </div>
        </div>

        {/* Recent scrape jobs */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a0a0a', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Recent Scrape Jobs
          </h2>
          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 13 }}>Loading…</div>
            ) : recentJobs.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 13 }}>
                No scrape jobs yet. Go to Scraper Control to run the first one.
              </div>
            ) : (
              recentJobs.map((job, i) => (
                <div key={job.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 20px',
                  borderBottom: i < recentJobs.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a0a0a' }}>
                      {job.scrape_sources?.name ?? 'Unknown source'}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      {new Date(job.created_at).toLocaleString('en-IN')} · {job.images_saved} saved
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
                    padding: '3px 10px', borderRadius: 20,
                    background: `${statusColor[job.status]}18`,
                    color: statusColor[job.status],
                  }}>
                    {job.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Model accuracy panel */}
      {stats.activeModel && (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a0a0a', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Active Model — {stats.activeModel.version_label}
          </h2>
          <div style={{ display: 'flex', gap: 32 }}>
            {[
              { label: 'R² Score (cost_min)', value: stats.activeModel.r2_min ?? '—' },
              { label: 'R² Score (cost_max)', value: stats.activeModel.r2_max ?? '—' },
              { label: 'Training Set', value: `${stats.labelledImages ?? 0} images` },
              { label: 'Trained', value: stats.activeModel.trained_at ? new Date(stats.activeModel.trained_at).toLocaleDateString('en-IN') : '—' },
            ].map(m => (
              <div key={m.label}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#7a1c1c', fontFamily: "'Cormorant Garamond', serif" }}>{m.value}</div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
