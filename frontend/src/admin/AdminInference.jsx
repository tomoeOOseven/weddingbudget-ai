import React, { useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';
import { FiCpu, FiImage } from 'react-icons/fi';

const HF_SPACE_BASE = 'https://gamerquant-wedding-decor-price.hf.space';

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function domainFromUrl(rawUrl) {
  try {
    return new URL(String(rawUrl || '')).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function parseSseData(text) {
  const lines = String(text || '').split(/\r?\n/);
  let last = null;
  for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      last = JSON.parse(payload);
    } catch {
      // ignore non-JSON chunks
    }
  }

  if (last && Array.isArray(last.data)) return { data: last.data };
  if (Array.isArray(last)) return { data: last };
  return null;
}

async function callPredictApi(payload) {
  // Gradio call API: POST /call/{api_name} then read event stream.
  let callBody = null;
  let startStatus = 0;
  for (const startUrl of [
    `${HF_SPACE_BASE}/gradio_api/call/predict`,
    `${HF_SPACE_BASE}/gradio_api/call/predict/`,
  ]) {
    const callStart = await fetch(startUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    startStatus = callStart.status;
    callBody = await callStart.json().catch(() => ({}));
    if (callStart.ok) break;
    callBody = null;
  }

  if (!callBody) {
    throw new Error(`Prediction API failed (${startStatus})`);
  }

  if (!callBody?.event_id) {
    if (Array.isArray(callBody?.data)) return callBody;
    throw new Error('Prediction API returned no event_id and no data.');
  }

  for (const resultUrl of [
    `${HF_SPACE_BASE}/gradio_api/call/predict/${callBody.event_id}`,
    `${HF_SPACE_BASE}/gradio_api/call/predict/${callBody.event_id}/`,
  ]) {
    const callResult = await fetch(resultUrl);
    if (!callResult.ok) continue;
    const callText = await callResult.text();
    const parsed = parseSseData(callText);
    if (parsed) return parsed;
  }

  throw new Error('Prediction API returned an unreadable event stream.');
}

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
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadImages() {
      setLoading(true);
      try {
        const data = await apiFetch('/api/scraper/images?limit=200');
        const list = (data.images ?? []).map((img) => ({
          ...img,
          id: img.id,
          title: img.title || 'Scraped Image',
          imageUrl: img.publicUrl || img.image_url || img.image_url || null,
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

  const selectedIndex = useMemo(
    () => images.findIndex((i) => i.id === selectedImageId),
    [images, selectedImageId]
  );

  function selectIndex(index) {
    if (!images.length) return;
    const clamped = Math.max(0, Math.min(images.length - 1, index));
    setSelectedImageId(images[clamped].id);
    setPrediction(null);
    setMessage('');
  }

  async function handlePredictClick() {
    if (!selected?.imageUrl) {
      setMessage('Error: Selected image has no URL to send for inference.');
      return;
    }

    setPredicting(true);
    setPrediction(null);
    setMessage('');

    try {
      const imgRes = await fetch(selected.imageUrl);
      if (!imgRes.ok) throw new Error(`Failed to fetch image (${imgRes.status})`);
      const base64Image = await toDataUrl(await imgRes.blob());

      const listingUrl = selected.source_url || selected.listing_url || selected.image_url || '';
      const sourceDomain = domainFromUrl(listingUrl || selected.imageUrl);

      const payload = {
        data: [
          base64Image,
          selected.title || 'Scraped Image',
          sourceDomain,
          listingUrl,
        ],
      };

      const body = await callPredictApi(payload);
      setPrediction(body);
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setPredicting(false);
    }
  }

  const S = {
    title: { fontFamily: "'Cormorant Garamond',serif", fontSize: 28, color: '#1a0a0a', margin: 0 },
    sub: { color: '#888', fontSize: 13, margin: '4px 0 20px' },
  };

  return (
    <div style={{ fontFamily: "'Jost',sans-serif" }}>
      <h1 style={S.title}><FiCpu style={{ verticalAlign: 'middle', marginRight: 8 }} />Model Inference</h1>
      <p style={S.sub}>Choose a scraped image and trigger a cost prediction run.</p>

      {loading ? (
        <div style={{ color: '#999', fontSize: 13 }}>Loading scraped images...</div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ background: '#fff', border: '1px solid #eee4d8', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Select Scraped Image</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                disabled={selectedIndex <= 0}
                onClick={() => selectIndex(selectedIndex - 1)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: '1px solid #e0d5c5',
                  background: selectedIndex <= 0 ? '#f3f4f6' : '#fff',
                  color: selectedIndex <= 0 ? '#9ca3af' : '#7a1c1c',
                  fontWeight: 700,
                  cursor: selectedIndex <= 0 ? 'default' : 'pointer',
                }}
              >
                {'<'}
              </button>

              <div style={{
                flex: 1,
                minHeight: 34,
                border: '1px solid #e0d5c5',
                borderRadius: 8,
                padding: '7px 10px',
                fontSize: 12,
                color: '#333',
                background: '#fff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {selected ? `${selected.title} (${selected.status})` : 'No image selected'}
              </div>

              <button
                disabled={selectedIndex < 0 || selectedIndex >= images.length - 1}
                onClick={() => selectIndex(selectedIndex + 1)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: '1px solid #e0d5c5',
                  background: selectedIndex < 0 || selectedIndex >= images.length - 1 ? '#f3f4f6' : '#fff',
                  color: selectedIndex < 0 || selectedIndex >= images.length - 1 ? '#9ca3af' : '#7a1c1c',
                  fontWeight: 700,
                  cursor: selectedIndex < 0 || selectedIndex >= images.length - 1 ? 'default' : 'pointer',
                }}
              >
                {'>'}
              </button>
            </div>

            <button
              onClick={handlePredictClick}
              disabled={!selectedImageId || predicting}
              style={{
                marginTop: 12,
                padding: '10px 16px',
                background: !selectedImageId || predicting ? '#eee' : '#7a1c1c',
                border: 'none',
                borderRadius: 8,
                color: !selectedImageId || predicting ? '#aaa' : '#E8C97A',
                fontSize: 12,
                fontWeight: 700,
                cursor: !selectedImageId || predicting ? 'default' : 'pointer',
                fontFamily: "'Jost',sans-serif",
              }}
            >
              {predicting ? 'Predicting...' : 'Predict Cost'}
            </button>

            {message && <div style={{ marginTop: 10, fontSize: 12, color: '#0369a1' }}>{message}</div>}

            {prediction && (
              <div style={{ marginTop: 12, border:'1px solid #e0d5c5', borderRadius:8, padding:10, background:'#faf7f2' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 6 }}>Inference Response</div>
                {Array.isArray(prediction.data) && (
                  <div style={{ fontSize: 12, color: '#333', marginBottom: 8, lineHeight: 1.6 }}>
                    {prediction.data.map((line, idx) => (
                      <div key={idx}>{line === null ? 'null' : String(line)}</div>
                    ))}
                  </div>
                )}
                <pre style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:11, color:'#475569' }}>
                  {JSON.stringify(prediction, null, 2)}
                </pre>
              </div>
            )}
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
