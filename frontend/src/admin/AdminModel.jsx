import React, { useState, useEffect, useCallback } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';

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

export default function AdminModel() {
  const [versions, setVersions]     = useState([]);
  const [mlHealth, setMlHealth]     = useState(null);
  const [statusError, setStatusError] = useState('');
  const [trainingStats, setTrainingStats] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [versionLabel, setVersionLabel] = useState('');
  const [training, setTraining]     = useState(false);
  const [trainMsg, setTrainMsg]     = useState('');
  const [pollInterval, setPollInterval] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [statusData, statsData] = await Promise.all([
        apiFetch('/api/model/status'),
        apiFetch('/api/labelling/stats'),
      ]);
      setVersions(statusData.versions ?? []);
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
    if (!versionLabel.trim()) return;
    setTraining(true); setTrainMsg('');
    try {
      const data = await apiFetch('/api/model/train', {
        method: 'POST',
        body: JSON.stringify({ versionLabel: versionLabel.trim() }),
      });
      setTrainMsg(`✓ Training started — ${data.message}`);
      setVersionLabel('');
      setTimeout(loadData, 1000);
    } catch (e) { setTrainMsg(`Error: ${e.message}`); }
    finally { setTraining(false); }
  }

  async function handlePromote(versionId) {
    try {
      await apiFetch(`/api/model/promote/${versionId}`, { method: 'POST' });
      loadData();
    } catch (e) { alert(e.message); }
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
      <h1 style={S.title}>🧠 Model Training</h1>
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
              CLIP {mlHealth.clip_available ? '✓ loaded' : '✗ not available'} ·
              Model in memory: {mlHealth.model_loaded ? '✓' : '✗'}
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
            <MetricCard label="R² (cost_min)"  value={activeVersion.r2_min ?? '—'}  color="#7a1c1c" />
            <MetricCard label="R² (cost_max)"  value={activeVersion.r2_max ?? '—'}  color="#7a1c1c" />
            <MetricCard label="MAE (min)"       value={activeVersion.mae_min ? `₹${Number(activeVersion.mae_min).toLocaleString('en-IN')}` : '—'} color="#b45309" sub="Mean absolute error" />
            <MetricCard label="MAE (max)"       value={activeVersion.mae_max ? `₹${Number(activeVersion.mae_max).toLocaleString('en-IN')}` : '—'} color="#b45309" />
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
          Training runs in the background. The new model is automatically promoted to active
          if it performs better than the current version. You can also manually promote any version below.
        </p>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <input
            style={S.input}
            placeholder="Version label e.g. v1.2"
            value={versionLabel}
            onChange={e => setVersionLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTrain()}
          />
          <button
            style={S.btn(training || !versionLabel.trim() || (trainingStats?.inTraining ?? 0) < 20)}
            disabled={training || !versionLabel.trim() || (trainingStats?.inTraining ?? 0) < 20}
            onClick={handleTrain}
          >
            {training ? 'Starting…' : '🚀 Train'}
          </button>
        </div>
        {trainMsg && (
          <div style={{ marginTop:12, fontSize:13, color: trainMsg.startsWith('Error') ? '#dc2626' : '#15803d' }}>
            {trainMsg}
          </div>
        )}
        {(trainingStats?.inTraining ?? 0) < 20 && (
          <div style={{ marginTop:10, fontSize:12, color:'#dc2626' }}>
            ⚠️ Need at least 20 images in the training set. Currently have {trainingStats?.inTraining ?? 0}.
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
                  {['Version','Status','R² min','R² max','MAE min','Images','Trained',''].map(h => (
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
                    <td style={{ padding:'12px 16px', color:'#7a1c1c', fontWeight:600 }}>{v.r2_min ?? '—'}</td>
                    <td style={{ padding:'12px 16px', color:'#7a1c1c', fontWeight:600 }}>{v.r2_max ?? '—'}</td>
                    <td style={{ padding:'12px 16px' }}>{v.mae_min ? `₹${Number(v.mae_min).toLocaleString('en-IN')}` : '—'}</td>
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
                          Promote
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
