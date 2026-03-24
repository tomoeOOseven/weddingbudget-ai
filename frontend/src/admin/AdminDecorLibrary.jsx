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

function ImageCard({ item }) {
  const badgeStyle = {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.8px',
    padding: '2px 7px',
    borderRadius: 999,
    background: '#e0f2fe',
    color: '#0369a1',
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
          <span style={badgeStyle}>Scraped</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1f1f1f', lineHeight: 1.3, minHeight: 31 }}>
          {item.label || 'Decor Item'}
        </div>
        <div style={{ marginTop: 6 }}>
          {item.priceRangeTag && (
            <span
              style={{
                display: 'inline-block',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background:
                  item.priceRangeTag === 'Budget' ? '#dcfce7'
                    : item.priceRangeTag === 'Mid-Range' ? '#fef3c7'
                      : '#fee2e2',
                color:
                  item.priceRangeTag === 'Budget' ? '#166534'
                    : item.priceRangeTag === 'Mid-Range' ? '#92400e'
                      : '#991b1b',
              }}
            >
              {item.priceRangeTag}
            </span>
          )}
          {!item.priceRangeTag && (
            <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280' }}>
              Unclassified
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminDecorLibrary() {
  const [loading, setLoading] = useState(true);
  const [scraped, setScraped] = useState([]);
  const [priceFilter, setPriceFilter] = useState('All');
  const [error, setError] = useState('');

  const PRICE_FILTERS = ['All', 'Budget', 'Mid-Range', 'Premium'];

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const scrapedData = await apiFetch('/api/scraper/images?limit=400');

        const mappedScraped = (scrapedData.images ?? []).map((img) => ({
          id: img.id,
          label: img.title || 'Scraped Design',
          function: img.function_type,
          style: img.style,
          imageUrl: img.publicUrl || img.image_url || null,
          status: img.status,
          priceInr: img.price_inr,
          priceRangeTag: img.price_range_tag,
        }));

        setScraped(mappedScraped);
      } catch (e) {
        setError(e.message || 'Failed to load decor library');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const visible = useMemo(
    () => scraped.filter((item) => {
      const priceOk = priceFilter === 'All' || String(item.priceRangeTag || '') === priceFilter;
      return priceOk;
    }),
    [scraped, priceFilter],
  );

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
          description="No scraped decor is available yet. Run scraper and label images to populate this library."
        />
      ) : (
        <>
      <h1 style={S.title}>Decor Library</h1>
      <p style={S.sub}>Scraped decor catalog connected directly to database records.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#666' }}>Total: <strong>{scraped.length}</strong></div>
        {PRICE_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setPriceFilter(filter)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: `1px solid ${priceFilter === filter ? '#7a1c1c' : '#e0d5c5'}`,
              background: priceFilter === filter ? '#7a1c1c' : '#fff',
              color: priceFilter === filter ? '#E8C97A' : '#6b7280',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Jost',sans-serif",
            }}
          >
            {filter}
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
            <ImageCard key={item.id} item={item} />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
