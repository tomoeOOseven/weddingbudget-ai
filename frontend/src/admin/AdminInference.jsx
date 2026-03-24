import React, { useEffect, useMemo, useState } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';
import { FiArrowLeft, FiArrowRight, FiCpu, FiImage } from 'react-icons/fi';

const HF_SPACE_BASE = 'https://gamerquant-wedding-decor-price.hf.space';
const HF_GRADIO_RUN_PREDICT = `${HF_SPACE_BASE}/gradio_api/run/predict`;

function domainFromUrl(rawUrl) {
  try {
    return new URL(String(rawUrl || '')).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

async function callPredictApi(payload) {
  const response = await fetch(HF_GRADIO_RUN_PREDICT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || body?.detail || `Prediction API failed (${response.status})`);
  }
  return body;
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

function extractInferenceSummary(prediction) {
  const arr = Array.isArray(prediction?.data) ? prediction.data : [];
  const predictedTier = typeof arr[0] === 'string' ? arr[0] : '-';
  const priceRange = typeof arr[1] === 'string' ? arr[1] : '-';
  const details = typeof arr[2] === 'string' ? arr[2] : '';

  const confidenceMatch = details.match(/\*\*Confidence:\*\*\s*([^\n]+)/i);
  const timeMatch = details.match(/\*\*Inference time:\*\*\s*([^\n]+)/i);

  const confidence = confidenceMatch?.[1]?.trim() || '-';
  const inferenceTime = timeMatch?.[1]?.trim() ||
    (typeof prediction?.duration === 'number' ? `${prediction.duration.toFixed(2)}s` : '-');

  return {
    predictedTier,
    priceRange,
    confidence,
    inferenceTime,
  };
}

export default function AdminInference() {
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState('');
  const [modelSelector, setModelSelector] = useState('active');
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadImages() {
      setLoading(true);
      try {
        const [data, modelStatus] = await Promise.all([
          apiFetch('/api/scraper/images?limit=200'),
          apiFetch('/api/model/status').catch(() => null),
        ]);
        const list = (data.images ?? []).map((img) => ({
          ...img,
          id: img.id,
          title: img.title || 'Scraped Image',
          imageUrl: img.publicUrl || img.image_url || img.image_url || null,
          status: img.status,
        }));

        const activeVersion = (modelStatus?.versions ?? []).find((v) => v.is_active);
        const activeVersionLabel = String(activeVersion?.version_label || '').trim();
        setModelSelector(activeVersionLabel ? `version:${activeVersionLabel}` : 'active');

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
      const listingUrl = selected.source_url || selected.listing_url || selected.image_url || '';
      const sourceDomain = domainFromUrl(listingUrl || selected.imageUrl);
      const imageUrl = selected.imageUrl;
      const imageName = (() => {
        try {
          const pathname = new URL(imageUrl).pathname;
          const fileName = pathname.split('/').pop();
          return fileName || 'image.jpg';
        } catch {
          return 'image.jpg';
        }
      })();

      const payload = {
        data: [
          {
            path: imageUrl,
            meta: { _type: 'gradio.FileData' },
            orig_name: imageName,
            url: imageUrl,
          },
          selected.title || 'test decor',
          sourceDomain || 'wedmegood.com',
          listingUrl || '',
          modelSelector,
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
        <div style={{ maxWidth: 860 }}>
          <div style={{ background: '#fff', border: '1px solid #eee4d8', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Select Scraped Image</div>
            <select
              value={selectedImageId}
              onChange={(e) => {
                setSelectedImageId(e.target.value);
                setPrediction(null);
                setMessage('');
              }}
              style={{
                width: '100%',
                minHeight: 36,
                border: '1px solid #e0d5c5',
                borderRadius: 8,
                padding: '8px 11px',
                fontSize: 12,
                color: '#333',
                background: '#fff',
                marginBottom: 12,
                fontFamily: "'Jost',sans-serif",
              }}
            >
              {images.map((img) => (
                <option key={img.id} value={img.id}>{img.title || 'Scraped Image'}</option>
              ))}
            </select>

            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#f5f0eb' }}>
              {selected?.imageUrl ? (
                <img src={selected.imageUrl} alt={selected.title} style={{ width: '100%', maxHeight: 380, objectFit: 'contain', display: 'block', background: '#f5f0eb' }} />
              ) : (
                <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                  <FiImage size={28} />
                </div>
              )}

              <button
                disabled={selectedIndex <= 0}
                onClick={() => selectIndex(selectedIndex - 1)}
                aria-label="Previous image"
                style={{
                  position: 'absolute',
                  left: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: 'none',
                  background: selectedIndex <= 0 ? 'rgba(120,120,120,0.55)' : 'rgba(35,12,20,0.75)',
                  color: '#fff',
                  cursor: selectedIndex <= 0 ? 'default' : 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <FiArrowLeft />
              </button>

              <button
                disabled={selectedIndex < 0 || selectedIndex >= images.length - 1}
                onClick={() => selectIndex(selectedIndex + 1)}
                aria-label="Next image"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: 'none',
                  background: selectedIndex < 0 || selectedIndex >= images.length - 1 ? 'rgba(120,120,120,0.55)' : 'rgba(35,12,20,0.75)',
                  color: '#fff',
                  cursor: selectedIndex < 0 || selectedIndex >= images.length - 1 ? 'default' : 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <FiArrowRight />
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: '#444' }}>{selected?.title || 'No image selected'}</div>

            {prediction && (
              <div style={{ marginTop: 8, width: 'min(420px, 100%)', border:'1px solid #e0d5c5', borderRadius:8, padding:10, background:'#faf7f2' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 6 }}>Inference Response</div>
                {(() => {
                  const summary = extractInferenceSummary(prediction);
                  return (
                    <div style={{ fontSize: 12, color: '#333', lineHeight: 1.8 }}>
                      <div><strong>Predicted Tier:</strong> {summary.predictedTier}</div>
                      <div><strong>Price Range:</strong> {summary.priceRange}</div>
                      <div><strong>Confidence:</strong> {summary.confidence}</div>
                      <div><strong>Inference Time:</strong> {summary.inferenceTime}</div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={handlePredictClick}
                disabled={!selectedImageId || predicting}
                style={{
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
            </div>

            {message && <div style={{ marginTop: 10, fontSize: 12, color: '#0369a1', textAlign: 'right' }}>{message}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
