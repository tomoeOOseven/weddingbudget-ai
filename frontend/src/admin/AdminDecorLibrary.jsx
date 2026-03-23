import React, { useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';
import { FiImage } from 'react-icons/fi';
import AdminPlaceholder from './AdminPlaceholder.jsx';

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetchFromApi(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

function ImageCard({ item, type }) {
  const badgeStyle = {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.8px',
    padding: '2px 7px',
    borderRadius: 999,
    background: type === 'scraped' ? '#e0f2fe' : '#f5f0eb',
    color: type === 'scraped' ? '#0369a1' : '#7a1c1c',
    textTransform: 'uppercase',
  };

  return (
    <div style={{ border: '1px solid #eee4d8', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
      <div style={{ height: 130, background: '#f5f0eb' }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.label || 'Decor'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            <FiImage size={26} />
          </div>
        )}
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ marginBottom: 6 }}>
          <span style={badgeStyle}>{type === 'scraped' ? 'Scraped' : 'Seed'}</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1f1f1f', lineHeight: 1.3, minHeight: 31 }}>
          {item.label || 'Decor Item'}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>
          {item.function || item.function_type || 'other'} | {item.style || 'Traditional'}
        </div>
      </div>
    </div>
  );
}

export default function AdminDecorLibrary() {
  const [loading, setLoading] = useState(true);
  const [seedDecor, setSeedDecor] = useState([]);
  const [scraped, setScraped] = useState([]);
  const [tab, setTab] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const [seed, scrapedData] = await Promise.all([
          apiFetch('/api/decor'),
          apiFetch('/api/scraper/images?limit=200'),
        ]);

        const mappedSeed = (seed.items ?? []).map((d) => ({
          id: d.id,
          label: d.label,
          function: d.function_type,
          style: d.style,
          imageUrl: d.image_url
            ? (String(d.image_url).startsWith('http')
              ? d.image_url
              : (supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/decor-images/${d.image_url}` : null))
            : null,
        }));

        const mappedScraped = (scrapedData.images ?? []).map((img) => ({
          id: img.id,
          label: img.title || 'Scraped Design',
          function: img.function_type,
          style: img.style,
          imageUrl: img.publicUrl || img.image_url || null,
          status: img.status,
        }));

        setSeedDecor(mappedSeed);
        setScraped(mappedScraped);
      } catch (e) {
        setError(e.message || 'Failed to load decor library');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const visible = useMemo(() => {
    if (tab === 'seed') return seedDecor;
    if (tab === 'scraped') return scraped;
    return [...seedDecor, ...scraped];
  }, [tab, seedDecor, scraped]);

  const S = {
    title: { fontFamily: "'Cormorant Garamond',serif", fontSize: 28, color: '#1a0a0a', margin: 0 },
    sub: { color: '#888', fontSize: 13, margin: '4px 0 20px' },
  };

  return (
    <div style={{ fontFamily: "'Jost',sans-serif" }}>
      {scraped.length === 0 ? (
        <AdminPlaceholder
          icon={<FiImage />}
          title="Decor Library"
          description="Manage seed decor items. Scraped images are managed via the Labelling Queue."
        />
      ) : (
        <>
      <h1 style={S.title}>Decor Library</h1>
      <p style={S.sub}>Unified decor catalog with both seed data and scraped images.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          { key: 'all', label: `All (${seedDecor.length + scraped.length})` },
          { key: 'seed', label: `Seed (${seedDecor.length})` },
          { key: 'scraped', label: `Scraped (${scraped.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              border: `1px solid ${tab === t.key ? '#7a1c1c' : '#e0d5c5'}`,
              background: tab === t.key ? '#7a1c1c' : '#fff',
              color: tab === t.key ? '#E8C97A' : '#7a1c1c',
              padding: '7px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Jost',sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <div style={{ color: '#999', fontSize: 13 }}>Loading decor library...</div>
      ) : visible.length === 0 ? (
        <div style={{ color: '#999', fontSize: 13 }}>No decor images available.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {visible.map((item) => (
            <ImageCard
              key={item.id}
              item={item}
              type={scraped.some((x) => x.id === item.id) ? 'scraped' : 'seed'}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
