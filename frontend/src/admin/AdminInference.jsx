import React, { useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';
import { FiActivity, FiImage } from 'react-icons/fi';

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
      <h1 style={S.title}><FiActivity style={{ verticalAlign: 'middle', marginRight: 8 }} />Model Inference</h1>
      <p style={S.sub}>Choose a scraped image and trigger a cost prediction run.</p>

      {loading ? (
        <div style={{ color: '#999', fontSize: 13 }}>Loading scraped images...</div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ background: '#fff', border: '1px solid #eee4d8', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Select Scraped Image</div>
            <select
              value={selectedImageId}
              onChange={(e) => setSelectedImageId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0d5c5', borderRadius: 8, fontSize: 13 }}
            >
              {images.map((img) => (
                <option key={img.id} value={img.id}>
                  {img.title} ({img.status})
                </option>
              ))}
            </select>

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
