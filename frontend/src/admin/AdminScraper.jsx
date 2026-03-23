import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';
import { FiCheck, FiLoader, FiTool, FiX } from 'react-icons/fi';

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetchFromApi(path, {
    ...opts,
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed'); }
  return res.json();
}

const STATUS_COLOR = { completed:'#15803d', failed:'#dc2626', running:'#d97706', pending:'#6b7280', skipped:'#9ca3af' };

function StatusBadge({ status }) {
  return (
    <span style={{ fontSize:10, fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', padding:'3px 8px', borderRadius:20,
      background:`${STATUS_COLOR[status] ?? '#888'}18`, color:STATUS_COLOR[status] ?? '#888' }}>
      {status}
    </span>
  );
}

// ── Job Log Viewer ────────────────────────────────────────────────────────────
function JobLogModal({ jobId, onClose }) {
  const [job, setJob]       = useState(null);
  const [loading, setLoading] = useState(true);
  const logRef = useRef(null);

  useEffect(() => {
    let interval;
    async function load() {
      const d = await apiFetch(`/api/scraper/jobs/${jobId}`).catch(() => null);
      if (d) setJob(d);
      setLoading(false);
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    load();
    interval = setInterval(load, 3000); // poll if running
    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#1a1a1a', borderRadius:12, width:'min(700px,95vw)', maxHeight:'80vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #333', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ color:'#E8C97A', fontWeight:700 }}>
            Job Log {job && <StatusBadge status={job.status} />}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#888', fontSize:18, cursor:'pointer' }}><FiX /></button>
        </div>
        {loading ? (
          <div style={{ padding:'24px', color:'#888', textAlign:'center' }}>Loading…</div>
        ) : job ? (
          <>
            <div style={{ padding:'12px 20px', background:'#111', borderBottom:'1px solid #333', fontSize:12, color:'#aaa', display:'flex', gap:20 }}>
              <span>Source: {job.scrape_sources?.name}</span>
              <span>Found: {job.images_found}</span>
              <span>Saved: {job.images_saved}</span>
              <span>Duped: {job.images_duped}</span>
            </div>
            <div ref={logRef} style={{ flex:1, overflow:'auto', padding:'16px 20px', fontFamily:'monospace', fontSize:11, color:'#a3e635', lineHeight:1.7, background:'#0a0a0a' }}>
              {(job.log ?? []).map((line, i) => <div key={i}>{line}</div>)}
              {job.status === 'running' && <div style={{ color:'#f59e0b' }}><FiLoader style={{ verticalAlign:'middle' }} /> Running...</div>}
              {job.error_message && <div style={{ color:'#ef4444', marginTop:8 }}>ERROR: {job.error_message}</div>}
            </div>
          </>
        ) : <div style={{ padding:'24px', color:'#888' }}>Job not found.</div>}
      </div>
    </div>
  );
}

// ── Add Source Form ────────────────────────────────────────────────────────────
function AddSourceForm({ onSave, onCancel }) {
  const [f, setF] = useState({ name:'', base_url:'', scraper_type:'cheerio', rate_limit_ms:1500 });
  const s = (k,v) => setF(x => ({...x,[k]:v}));
  const inputStyle = { width:'100%', padding:'9px 12px', border:'1px solid #e0d5c5', borderRadius:7, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box', marginBottom:12 };

  return (
    <div>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>Add New Source</div>
      <input style={inputStyle} placeholder="Site name (e.g. WeddingWire India)" value={f.name} onChange={e=>s('name',e.target.value)} />
      <input style={inputStyle} placeholder="Base URL (e.g. https://www.weddingwire.in)" value={f.base_url} onChange={e=>s('base_url',e.target.value)} />
      <div style={{ display:'flex', gap:10, marginBottom:12 }}>
        <select value={f.scraper_type} onChange={e=>s('scraper_type',e.target.value)} style={{ ...inputStyle, marginBottom:0, flex:1 }}>
          <option value="cheerio">Cheerio (static sites)</option>
          <option value="playwright">Playwright (JS-heavy)</option>
        </select>
        <input type="number" placeholder="Rate limit ms" value={f.rate_limit_ms} onChange={e=>s('rate_limit_ms',parseInt(e.target.value))} style={{ ...inputStyle, marginBottom:0, flex:1 }} />
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={() => f.name && f.base_url && onSave(f)}
          disabled={!f.name || !f.base_url}
          style={{ padding:'8px 18px', background:'#7a1c1c', border:'none', borderRadius:7, color:'#E8C97A', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!f.name||!f.base_url?0.5:1 }}>
          Add Source
        </button>
        <button onClick={onCancel} style={{ padding:'8px 14px', background:'transparent', border:'1px solid #e0d5c5', borderRadius:7, color:'#888', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminScraper() {
  const [sources, setSources]   = useState([]);
  const [jobs, setJobs]         = useState([]);
  const [stats, setStats]       = useState({});
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState({});
  const [viewJobId, setViewJobId] = useState(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [msg, setMsg]           = useState('');
  const [pageMin, setPageMin]   = useState(1);
  const [pageMax, setPageMax]   = useState(3);

  const load = useCallback(async () => {
    try {
      const [srcData, jobData, statsData] = await Promise.all([
        apiFetch('/api/scraper/sources'),
        apiFetch('/api/scraper/jobs?limit=10'),
        apiFetch('/api/scraper/stats'),
      ]);
      setSources(srcData.sources ?? []);
      setJobs(jobData.jobs ?? []);
      setStats(statsData);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const loadLiveStats = useCallback(async () => {
    try {
      const [jobData, statsData] = await Promise.all([
        apiFetch('/api/scraper/jobs?limit=10'),
        apiFetch('/api/scraper/stats'),
      ]);
      setJobs(jobData.jobs ?? []);
      setStats(statsData);
    } catch {
      // keep last successful numbers if polling fails
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll numbers/jobs continuously without reloading the whole page.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) loadLiveStats();
    }, 5000);

    function onVisibilityChange() {
      if (!document.hidden) loadLiveStats();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => clearInterval(id);
  }, [loadLiveStats]);

  async function runScrape(sourceId, sourceName) {
    setRunning(r => ({ ...r, [sourceId]: true }));
    setMsg('');
    try {
      await apiFetch('/api/scraper/run', {
        method:'POST',
        body: JSON.stringify({ sourceId, pageMin: Number(pageMin), pageMax: Number(pageMax) }),
      });
      setMsg(`Scrape started for ${sourceName}`);
      setTimeout(loadLiveStats, 1000);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    finally { setRunning(r => ({ ...r, [sourceId]: false })); }
  }

  async function runAll() {
    setRunning(r => ({ ...r, __ALL__: true }));
    setMsg('');
    try {
      await apiFetch('/api/scraper/run', {
        method:'POST',
        body: JSON.stringify({ all: true, pageMin: Number(pageMin), pageMax: Number(pageMax) }),
      });
      setMsg('All-source scrape started in background');
      setTimeout(loadLiveStats, 1000);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    finally { setRunning(r => ({ ...r, __ALL__: false })); }
  }

  async function toggleSource(id, currentActive) {
    await apiFetch(`/api/scraper/sources/${id}/toggle`, { method:'PUT' }).catch(() => {});
    setSources(s => s.map(x => x.id===id ? {...x, is_active:!currentActive} : x));
  }

  async function addSource(data) {
    try {
      const res = await apiFetch('/api/scraper/sources', { method:'POST', body: JSON.stringify(data) });
      setSources(s => [...s, res.source]);
      setShowAdd(false);
      setMsg(`"${data.name}" added`);
    } catch (e) { setMsg(`Error: ${e.message}`); }
  }

  const S = {
    title: { fontFamily:"'Cormorant Garamond',serif", fontSize:28, color:'#1a0a0a', margin:0 },
    sub:   { color:'#888', fontSize:13, margin:'4px 0 20px' },
    statRow: { display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' },
    statCard: { background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:10, padding:'16px 20px', flex:1, minWidth:120 },
    statVal: { fontSize:26, fontWeight:700, fontFamily:"'Cormorant Garamond',serif", color:'#7a1c1c' },
    statLabel: { fontSize:11, color:'#888', marginTop:2 },
    table: { background:'#fff', border:'1px solid rgba(0,0,0,0.07)', borderRadius:12, overflow:'hidden', width:'100%', borderCollapse:'collapse' },
    th: { padding:'10px 16px', textAlign:'left', fontSize:10, letterSpacing:'1px', textTransform:'uppercase', color:'#888', fontWeight:600, background:'#f9f5ef', borderBottom:'1px solid #f0e8e0' },
    td: { padding:'12px 16px', borderBottom:'1px solid #f5f0eb', fontSize:13, verticalAlign:'middle' },
    runBtn: (dis) => ({ padding:'6px 14px', background: dis?'#eee':'#7a1c1c', border:'none', borderRadius:6, color:dis?'#aaa':'#E8C97A', fontSize:11, fontWeight:700, cursor:dis?'default':'pointer', fontFamily:'inherit' }),
  };

  return (
    <div style={{ fontFamily:"'Jost',sans-serif" }}>
      <h1 style={S.title}><FiTool style={{ verticalAlign:'middle', marginRight:8 }} />Scraper Control</h1>
      <p style={S.sub}>Manage tracked sites, trigger scrape runs, and monitor job logs.</p>

      {/* Stats */}
      <div style={S.statRow}>
        {[
          { label:'Total Images',    value: stats.totalImages    ?? '—' },
          { label:'Raw (Untagged)',  value: stats.rawImages      ?? '—', color:'#b45309' },
          { label:'Labelled',        value: stats.labelledImages ?? '—', color:'#15803d' },
          { label:'Active Sources',  value: stats.activeSources  ?? '—' },
          { label:'Currently Running',value:stats.currentlyRunning ?? 0, color: (stats.currentlyRunning??0)>0?'#d97706':'#7a1c1c' },
        ].map(s => (
          <div key={s.label} style={S.statCard}>
            <div style={{ ...S.statVal, color:s.color??'#7a1c1c' }}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <label style={{ fontSize:12, color:'#666' }}>Pages</label>
        <input
          type="number"
          min={1}
          step={50}
          value={pageMin}
          onChange={(e) => setPageMin(Math.max(1, Number(e.target.value) || 1))}
          style={{ width:72, padding:'8px 10px', border:'1px solid #e0d5c5', borderRadius:7, fontSize:12 }}
        />
        <span style={{ fontSize:12, color:'#666' }}>to</span>
        <input
          type="number"
          min={1}
          step={50}
          value={pageMax}
          onChange={(e) => setPageMax(Math.max(1, Number(e.target.value) || 1))}
          style={{ width:72, padding:'8px 10px', border:'1px solid #e0d5c5', borderRadius:7, fontSize:12 }}
        />
        <button onClick={runAll} disabled={running.__ALL__}
          style={{ padding:'10px 20px', background: running.__ALL__ ? '#eee' : '#1a0a0a', border:'none', borderRadius:8, color: running.__ALL__ ? '#aaa' : '#E8C97A', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          {running.__ALL__ ? 'Running All...' : 'Run All Sources'}
        </button>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding:'10px 16px', background:'transparent', border:'1px solid #e0d5c5', borderRadius:8, color:'#7a1c1c', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          {showAdd ? 'Cancel' : '+ Add Source'}
        </button>
        {msg && <span style={{ fontSize:12, color: msg.startsWith('Error')?'#dc2626':'#15803d' }}>{msg}</span>}
      </div>

      {/* Add source form */}
      {showAdd && (
        <div style={{ background:'#f9f5ef', border:'1px solid #e8d5b0', borderRadius:10, padding:'20px', marginBottom:20 }}>
          <AddSourceForm onSave={addSource} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {/* Sources table */}
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:14, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', color:'#333', marginBottom:12 }}>Tracked Sites ({sources.length})</div>
        <table style={S.table}>
          <thead>
            <tr>
              {['Site Name','URL','Scraper','Rate Limit','Last Scraped','Status',''].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#999' }}>Loading…</td></tr>
            ) : sources.map(src => (
              <tr key={src.id}>
                <td style={S.td}><span style={{ fontWeight:600 }}>{src.name}</span></td>
                <td style={S.td}><a href={src.base_url} target="_blank" rel="noopener noreferrer" style={{ color:'#7a1c1c', fontSize:11 }}>{src.base_url.replace('https://','').replace('www.','').split('/')[0]}</a></td>
                <td style={S.td}><span style={{ fontSize:10, background: src.scraper_type==='playwright'?'#e0f2fe':'#f0fdf4', color:src.scraper_type==='playwright'?'#0369a1':'#15803d', padding:'2px 7px', borderRadius:10, fontWeight:700 }}>{src.scraper_type}</span></td>
                <td style={S.td}>{src.rate_limit_ms}ms</td>
                <td style={S.td}>{src.last_scraped_at ? new Date(src.last_scraped_at).toLocaleDateString('en-IN') : <span style={{ color:'#aaa' }}>Never</span>}</td>
                <td style={S.td}>
                  <div onClick={() => toggleSource(src.id, src.is_active)} style={{ width:36, height:20, borderRadius:10, background:src.is_active?'#7a1c1c':'#ccc', cursor:'pointer', position:'relative', transition:'background 0.2s' }}>
                    <div style={{ position:'absolute', top:2, left:src.is_active?18:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s' }} />
                  </div>
                </td>
                <td style={S.td}>
                  <button onClick={() => runScrape(src.id, src.name)} disabled={!src.is_active || running[src.id] || src.isRunning}
                    style={S.runBtn(!src.is_active || running[src.id] || src.isRunning)}>
                    {running[src.id] || src.isRunning ? 'Running' : 'Run'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent jobs */}
      <div>
        <div style={{ fontSize:14, fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', color:'#333', marginBottom:12 }}>Recent Jobs</div>
        <table style={S.table}>
          <thead>
            <tr>{['Source','Status','Found','Saved','Duped','Started',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#999' }}>No jobs yet. Run a scrape above.</td></tr>
            ) : jobs.map(job => (
              <tr key={job.id}>
                <td style={S.td}>{job.scrape_sources?.name ?? '—'}</td>
                <td style={S.td}><StatusBadge status={job.status} /></td>
                <td style={S.td}>{job.images_found ?? 0}</td>
                <td style={{ ...S.td, color:'#15803d', fontWeight:600 }}>{job.images_saved ?? 0}</td>
                <td style={S.td}>{job.images_duped ?? 0}</td>
                <td style={S.td}>{job.started_at ? new Date(job.started_at).toLocaleString('en-IN') : '—'}</td>
                <td style={S.td}>
                  <button onClick={() => setViewJobId(job.id)} style={{ padding:'5px 12px', background:'#f5f0eb', border:'1px solid #e0d5c5', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', color:'#7a1c1c', fontFamily:'inherit' }}>
                    View Log
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewJobId && <JobLogModal jobId={viewJobId} onClose={() => setViewJobId(null)} />}
    </div>
  );
}
