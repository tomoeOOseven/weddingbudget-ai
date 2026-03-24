import React, { useState, useEffect, useCallback } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';
import { FiActivity, FiAlertTriangle } from 'react-icons/fi';

const HF_SPACE_BASE = 'https://gamerquant-wedding-decor-price.hf.space';
const HF_RETRAIN_CALL = `${HF_SPACE_BASE}/gradio_api/call/trigger_retrain`;

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetchFromApi(path, {
    ...opts,
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

function normalizeVersions(list = []) {
  const sorted = [...list].sort((a, b) => {
    const aTs = a?.trained_at ? new Date(a.trained_at).getTime() : 0;
    const bTs = b?.trained_at ? new Date(b.trained_at).getTime() : 0;
    return bTs - aTs;
  });

  let activeSeen = false;
  return sorted.map((version) => {
    const normalizedActive = Boolean(version.is_active) && !activeSeen;
    if (normalizedActive) activeSeen = true;
    return { ...version, is_active: normalizedActive };
  });
}

function MetricCard({ label, value, sub, color = '#7a1c1c' }) {
  return (
    <div style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:10, padding:'18px 20px', flex:1, minWidth:130 }}>
      <div style={{ fontSize:26, fontWeight:700, color, fontFamily:"'Cormorant Garamond',serif" }}>{value ?? '—'}</div>
      <div style={{ fontSize:12, fontWeight:600, color:'#333', marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'#999', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    ready:    { bg:'#f0fdf4', color:'#15803d', label:'Ready' },
    training: { bg:'#fffbeb', color:'#b45309', label:'Training…' },
    failed:   { bg:'#fef2f2', color:'#dc2626', label:'Failed' },
    deprecated:{ bg:'#f5f5f5', color:'#888', label:'Deprecated' },
  };
  const s = map[status] ?? { bg:'#f5f5f5', color:'#888', label: status };
  return (
    <span style={{ background:s.bg, color:s.color, fontSize:10, fontWeight:700,
      padding:'3px 10px', borderRadius:20, letterSpacing:'1px', textTransform:'uppercase' }}>
      {s.label}
    </span>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSseEvents(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const events = [];
  let currentEvent = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      const dataRaw = line.slice('data:'.length).trim();
      let parsed = dataRaw;
      try { parsed = JSON.parse(dataRaw); } catch {}
      events.push({ event: currentEvent || 'message', data: parsed, raw: dataRaw });
    }
  }

  return events;
}

function messageFromSseData(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (typeof data === 'string') return data;
  return null;
}

export default function AdminModel() {
  const [versions, setVersions]     = useState([]);
  const [mlHealth, setMlHealth]     = useState(null);
  const [statusError, setStatusError] = useState('');
  const [trainingStats, setTrainingStats] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [retrainSecret, setRetrainSecret] = useState('');
  const [training, setTraining]     = useState(false);
  const [promotingId, setPromotingId] = useState(null);
  const [trainMsg, setTrainMsg]     = useState('');
  const [pollInterval, setPollInterval] = useState(null);
  const canStartTrain = Boolean(retrainSecret.trim()) && !training;

  const loadData = useCallback(async () => {
    try {
      const [statusData, statsData] = await Promise.all([
        apiFetch('/api/model/status'),
        apiFetch('/api/labelling/stats'),
      ]);
      setVersions(normalizeVersions(statusData.versions ?? []));
      setMlHealth(statusData.mlHealth);
      setTrainingStats(statsData);
      setStatusError('');
    } catch (e) {
      console.error(e);
      setStatusError(e?.message || 'Could not load model status.');
      setMlHealth(null);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Poll while a training job is running
  useEffect(() => {
    const isTraining = versions.some(v => v.status === 'training');
    if (isTraining && !pollInterval) {
      const id = setInterval(loadData, 4000);
      setPollInterval(id);
    } else if (!isTraining && pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, [versions]);

  async function handleTrain() {
    if (!retrainSecret.trim()) return;
    setTraining(true); setTrainMsg('');
    try {
      const startRes = await fetch(HF_RETRAIN_CALL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [retrainSecret.trim()],
        }),
      });

      const startBody = await startRes.json().catch(() => ({}));
      if (!startRes.ok) {
        throw new Error(startBody?.error || startBody?.detail || `Retrain start failed (${startRes.status})`);
      }

      const eventId = startBody?.event_id;
      if (!eventId) {
        throw new Error('Retrain start did not return an event_id.');
      }

      setTrainMsg(`Retrain queued. Event ID: ${eventId}`);

      const maxAttempts = 240;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const pollRes = await fetch(`${HF_RETRAIN_CALL}/${eventId}`, {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
          cache: 'no-store',
        });

        const rawText = await pollRes.text();
        if (!pollRes.ok) {
          throw new Error(`Retrain poll failed (${pollRes.status})`);
        }

        const events = parseSseEvents(rawText);
        const latest = events.length ? events[events.length - 1] : null;

        if (latest) {
          const msg = messageFromSseData(latest.data);
          if (latest.event === 'complete') {
            if (msg == null) {
              throw new Error('Retrain completed with null response. Check retrain secret.');
            }
            setTrainMsg(String(msg));
            setRetrainSecret('');
            await loadData();
            return;
          }

          if (msg) {
            setTrainMsg(String(msg));
          }
        }

        await sleep(3000);
      }

      throw new Error('Retrain polling timed out before completion.');
    } catch (e) { setTrainMsg(`Error: ${e.message}`); }
    finally { setTraining(false); }
  }

  async function handlePromote(versionId) {
    setPromotingId(versionId);
    try {
      const data = await apiFetch(`/api/model/promote/${versionId}`, { method: 'POST' });
      if (Array.isArray(data?.versions) && data.versions.length) {
        setVersions(normalizeVersions(data.versions));
      } else {
        setVersions((prev) => normalizeVersions(prev.map(v => ({
          ...v,
          is_active: v.id === versionId,
        }))));
      }
      await loadData();
    } catch (e) { alert(e.message); }
    finally { setPromotingId(null); }
  }

  const activeVersion = versions.find(v => v.is_active);

  const S = {
    title: { fontFamily:"'Cormorant Garamond',serif", fontSize:28, color:'#1a0a0a', margin:0 },
    sub:   { color:'#888', fontSize:13, margin:'4px 0 24px' },
    section: { marginBottom:28 },
    sectionTitle: { fontSize:13, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', color:'#333', marginBottom:14 },
    card:  { background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:12, padding:'20px 24px' },
    input: { padding:'10px 14px', border:'1px solid #e0d5c5', borderRadius:8, fontSize:14,
             fontFamily:"'Jost',sans-serif", outline:'none', width:200 },
    btn:   (disabled) => ({
      padding:'10px 20px', background: disabled ? '#eee' : '#7a1c1c', border:'none', borderRadius:8,
      color: disabled ? '#aaa' : '#E8C97A', fontSize:13, fontWeight:700,
      cursor: disabled ? 'default' : 'pointer', fontFamily:"'Jost',sans-serif", letterSpacing:'0.5px',
    }),
  };

  return (
    <div style={{ fontFamily:"'Jost',sans-serif" }}>
      <h1 style={S.title}><FiActivity style={{ verticalAlign: 'middle', marginRight: 8 }} />Model Training</h1>
      <p style={S.sub}>Train, evaluate, and promote cost prediction models.</p>

      {/* ML Service health */}
      <div style={{ ...S.card, marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:10, height:10, borderRadius:'50%',
          background: statusError ? '#d97706' : (mlHealth?.available ? '#16a34a' : (mlHealth?.warming_up ? '#d97706' : '#dc2626')) }} />
        <div style={{ fontSize:13 }}>
          ML Service: <strong>
            {statusError
              ? 'Status Unavailable'
              : (mlHealth?.available
                ? 'Online'
                : (mlHealth?.warming_up ? 'Warming Up' : 'Offline'))}
          </strong>
          {mlHealth?.available && (
            <span style={{ color:'#888', marginLeft:12 }}>
              CLIP {mlHealth.clip_available ? 'loaded' : 'not available'} ·
              Model in memory: {mlHealth.model_loaded ? 'loaded' : 'not loaded'}
            </span>
          )}
          {!mlHealth?.available && mlHealth?.warming_up && !statusError && (
            <div style={{ color:'#b45309', marginTop:4, fontSize:11 }}>
              ML service is reachable but warming up (gateway {mlHealth.status_code ?? 'transient'}). Retry in 20-40s.
            </div>
          )}
          {!mlHealth?.available && mlHealth?.checked_url && !statusError && (
            <div style={{ color:'#999', marginTop:4, fontSize:11 }}>
              Checked: {mlHealth.checked_url}
            </div>
          )}
          {!mlHealth?.available && mlHealth?.error && !statusError && (
            <div style={{ color:'#b45309', marginTop:2, fontSize:11 }}>
              Error: {mlHealth.error}
            </div>
          )}
          {statusError && (
            <div style={{ color:'#b45309', marginTop:4, fontSize:11 }}>
              Could not fetch model status: {statusError}
            </div>
          )}
        </div>
      </div>

      {/* Active model metrics */}
      {activeVersion && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Active Model — {activeVersion.version_label}</div>
          <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
            <MetricCard label="Accuracy" value={activeVersion.accuracy != null ? `${(Number(activeVersion.accuracy) * 100).toFixed(1)}%` : '—'} color="#7a1c1c" />
            <MetricCard label="Precision" value={activeVersion.precision != null ? `${(Number(activeVersion.precision) * 100).toFixed(1)}%` : '—'} color="#7a1c1c" />
            <MetricCard label="Recall" value={activeVersion.recall != null ? `${(Number(activeVersion.recall) * 100).toFixed(1)}%` : '—'} color="#b45309" />
            <MetricCard label="F1 Score" value={activeVersion.f1_score != null ? `${(Number(activeVersion.f1_score) * 100).toFixed(1)}%` : '—'} color="#b45309" />
            <MetricCard label="Training Images" value={activeVersion.training_set_size ?? '—'} color="#15803d" sub="labelled images used" />
          </div>
        </div>
      )}

      {/* Dataset readiness */}
      <div style={{ ...S.card, marginBottom:24 }}>
        <div style={S.sectionTitle}>Dataset Readiness</div>
        <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
          {[
            { label:'In Training Set', value: trainingStats?.inTraining ?? 0, min:20,  color:'#15803d' },
            { label:'Total Labelled',  value: trainingStats?.totalLabelled ?? 0, min:0, color:'#7a1c1c' },
            { label:'Pending Sign-off',value: trainingStats?.pendingSuggestions ?? 0, min:0, color:'#d97706' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize:22, fontWeight:700, color: item.value >= item.min ? item.color : '#dc2626',
                fontFamily:"'Cormorant Garamond',serif" }}>{item.value}</div>
              <div style={{ fontSize:12, color:'#666' }}>{item.label}</div>
              {item.min > 0 && item.value < item.min && (
                <div style={{ fontSize:10, color:'#dc2626', marginTop:2 }}>Need ≥{item.min} to train</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Trigger training */}
      <div style={{ ...S.card, marginBottom:24 }}>
        <div style={S.sectionTitle}>Trigger Retrain</div>
        <p style={{ fontSize:13, color:'#666', lineHeight:1.6, marginBottom:16 }}>
          Retraining runs in the Hugging Face queue. Enter the retrain secret to start and monitor the run status.
        </p>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <input
            style={S.input}
            type="password"
            placeholder="Retrain secret"
            value={retrainSecret}
            onChange={e => setRetrainSecret(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTrain()}
          />
          <button
            style={S.btn(!canStartTrain)}
            disabled={!canStartTrain}
            onClick={handleTrain}
          >
            {training ? 'Running…' : 'Start Retrain'}
          </button>
        </div>
        {trainMsg && (
          <div style={{ marginTop:12, fontSize:13, color: trainMsg.startsWith('Error') ? '#dc2626' : '#15803d' }}>
            {trainMsg}
          </div>
        )}
      </div>

      {/* Version history */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Version History</div>
        {loading ? (
          <div style={{ color:'#999', fontSize:13 }}>Loading…</div>
        ) : versions.length === 0 ? (
          <div style={{ ...S.card, textAlign:'center', padding:'32px', color:'#999', fontSize:13 }}>
            No model versions yet. Trigger a training run above.
          </div>
        ) : (
          <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f9f5ef', borderBottom:'1px solid #f0e8e0' }}>
                  {['Version','Status','Accuracy','Precision','Recall','F1','Images','Trained',''].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:10,
                      letterSpacing:'1px', textTransform:'uppercase', color:'#888', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {versions.map((v, i) => (
                  <tr key={v.id} style={{ borderBottom: i < versions.length-1 ? '1px solid #f5f0eb' : 'none' }}>
                    <td style={{ padding:'12px 16px', fontWeight:700 }}>
                      {v.version_label}
                      {v.is_active && <span style={{ marginLeft:8, fontSize:9, background:'#7a1c1c', color:'#E8C97A',
                        padding:'2px 6px', borderRadius:10 }}>ACTIVE</span>}
                    </td>
                    <td style={{ padding:'12px 16px' }}><StatusBadge status={v.status} /></td>
                    <td style={{ padding:'12px 16px', color:'#7a1c1c', fontWeight:600 }}>{v.accuracy != null ? `${(Number(v.accuracy) * 100).toFixed(1)}%` : '—'}</td>
                    <td style={{ padding:'12px 16px', color:'#7a1c1c', fontWeight:600 }}>{v.precision != null ? `${(Number(v.precision) * 100).toFixed(1)}%` : '—'}</td>
                    <td style={{ padding:'12px 16px' }}>{v.recall != null ? `${(Number(v.recall) * 100).toFixed(1)}%` : '—'}</td>
                    <td style={{ padding:'12px 16px' }}>{v.f1_score != null ? `${(Number(v.f1_score) * 100).toFixed(1)}%` : '—'}</td>
                    <td style={{ padding:'12px 16px' }}>{v.training_set_size ?? '—'}</td>
                    <td style={{ padding:'12px 16px', color:'#999', fontSize:12 }}>
                      {v.trained_at ? new Date(v.trained_at).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      {v.status === 'ready' && !v.is_active && (
                        <button onClick={() => handlePromote(v.id)}
                          style={{ padding:'5px 12px', background:'#f5f0eb', border:'1px solid #e0d5c5',
                            borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', color:'#7a1c1c',
                            fontFamily:"'Jost',sans-serif" }}>
                          {promotingId === v.id ? 'Promoting...' : 'Promote'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
