import React, { useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';
import { FiImage, FiSearch } from 'react-icons/fi';

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

export default function AdminInference() {
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadImages() {
      setLoading(true);
      try {
        const data = await apiFetch('/api/scraper/images?limit=200');
        const list = (data.images ?? []).map((img) => ({
          id: img.id,
          title: img.title || 'Scraped Image',
          imageUrl: img.publicUrl || img.image_url || null,
          status: img.status,
        }));
        setImages(list);
        if (list.length > 0) setSelectedImageId(list[0].id);
      } catch (e) {
        setMessage(`Error: ${e.message}`);
      } finally {
        setLoading(false);
      }
    }

    loadImages();
  }, []);

  const selected = useMemo(
    () => images.find((i) => i.id === selectedImageId) || null,
    [images, selectedImageId]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return images;
    return images.filter((img) =>
      [img.title, img.status].some((v) => String(v ?? '').toLowerCase().includes(q))
    );
  }, [images, query]);

  function handlePredictClick() {
    // Placeholder flow requested by user. Prediction API wiring will be added later.
    setMessage('Predict button is wired in UI. Inference logic will be connected in the next step.');
  }

  const S = {
    title: { fontFamily: "'Cormorant Garamond',serif", fontSize: 28, color: '#1a0a0a', margin: 0 },
    sub: { color: '#888', fontSize: 13, margin: '4px 0 20px' },
  };

  return (
    <div style={{ fontFamily: "'Jost',sans-serif" }}>
      <h1 style={S.title}>🔮 Model Inference</h1>
      <p style={S.sub}>Choose a scraped image and trigger a cost prediction run.</p>

      {loading ? (
        <div style={{ color: '#999', fontSize: 13 }}>Loading scraped images...</div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.2fr 1fr' }}>
          <div style={{ background: '#fff', border: '1px solid #eee4d8', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Select Scraped Image</div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <FiSearch style={{ position: 'absolute', left: 10, top: 10, color: '#999' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or status"
                style={{ width: '100%', padding: '8px 10px 8px 30px', border: '1px solid #e0d5c5', borderRadius: 8, fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, maxHeight: 380, overflow: 'auto' }}>
              {visible.map((img) => {
                const active = selectedImageId === img.id;
                return (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    style={{
                      textAlign: 'left',
                      border: active ? '2px solid #7a1c1c' : '1px solid #e0d5c5',
                      borderRadius: 8,
                      background: active ? '#fdf4f4' : '#fff',
                      padding: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ height: 74, borderRadius: 6, overflow: 'hidden', background: '#f5f0eb', marginBottom: 6 }}>
                      {img.imageUrl ? (
                        <img src={img.imageUrl} alt={img.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}><FiImage /></div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#222', lineHeight: 1.3, minHeight: 28 }}>
                      {img.title}
                    </div>
                    <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>{img.status}</div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handlePredictClick}
              disabled={!selectedImageId}
              style={{
                marginTop: 12,
                padding: '10px 16px',
                background: !selectedImageId ? '#eee' : '#7a1c1c',
                border: 'none',
                borderRadius: 8,
                color: !selectedImageId ? '#aaa' : '#E8C97A',
                fontSize: 12,
                fontWeight: 700,
                cursor: !selectedImageId ? 'default' : 'pointer',
                fontFamily: "'Jost',sans-serif",
              }}
            >
              Predict Cost
            </button>

            {message && <div style={{ marginTop: 10, fontSize: 12, color: '#0369a1' }}>{message}</div>}
          </div>

          <div style={{ background: '#fff', border: '1px solid #eee4d8', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Preview</div>
            {selected?.imageUrl ? (
              <img src={selected.imageUrl} alt={selected.title} style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 8 }} />
            ) : (
              <div style={{ height: 220, borderRadius: 8, background: '#f5f0eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                <FiImage size={28} />
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: '#444' }}>{selected?.title || 'No image selected'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
