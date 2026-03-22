// Step7Report.jsx — full report with export, scenarios, and actuals tracker
import React, { useState, useEffect } from 'react';
import { BtnPrimary, BtnOutline, CAT_COLORS, fmt } from './ui.jsx';
import { downloadPDF, downloadXLSX, fetchActuals, addActual, updateActual, deleteActual, fetchScenarios, saveScenario, deleteScenario, calculateEstimate } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FiBarChart2, FiDownload, FiFileText, FiX } from 'react-icons/fi';

// ── PDF Export ────────────────────────────────────────────────────────────────
function ExportButton({ budget, inputs }) {
  const [pdfLoading, setPdfLoading]   = useState(false);
  const [xlsxLoading, setXlsxLoading] = useState(false);

  function buildPayload() {
    return {
      items:   budget.items,
      summary: { conservative: budget.tMin, expected: budget.tMid, luxury: budget.tMax },
      meta:    { city: inputs.city, hotelTier: inputs.hotelTier, guests: inputs.guests, rooms: inputs.rooms },
    };
  }

  async function handlePDF() {
    setPdfLoading(true);
    try {
      const { blob, contentType } = await downloadPDF(buildPayload());
      if (!contentType.includes('application/pdf')) {
        throw new Error('Backend did not return a PDF document.');
      }
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'WeddingBudget_Estimate.pdf'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message || 'PDF export requires the backend to be running.'); }
    finally { setPdfLoading(false); }
  }

  async function handleXLSX() {
    setXlsxLoading(true);
    try {
      const blob = await downloadXLSX(buildPayload());
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'WeddingBudget_Estimate.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Excel export requires the backend to be running.'); }
    finally { setXlsxLoading(false); }
  }

  return (
    <>
      <BtnOutline onClick={handlePDF}  disabled={pdfLoading}>{pdfLoading  ? 'Generating…' : <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><FiDownload /> Export PDF</span>}</BtnOutline>
      <BtnOutline onClick={handleXLSX} disabled={xlsxLoading}>{xlsxLoading ? 'Generating…' : <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><FiBarChart2 /> Export Excel</span>}</BtnOutline>
    </>
  );
}

// ── Scenario Comparison ───────────────────────────────────────────────────────
function ScenarioComparison({ weddingId, estimateId }) {
  const [scenarios, setScenarios] = useState([]);
  const [saving, setSaving]       = useState(false);
  const [name, setName]           = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (weddingId) {
      fetchScenarios(weddingId).then(d => setScenarios(d.scenarios ?? [])).catch(() => {});
    }
  }, [weddingId]);

  async function handleSave() {
    if (!weddingId || !name.trim()) return;
    setSaving(true);
    try {
      const data = await saveScenario({
        weddingId,
        label: name.trim(),
        estimateId: estimateId ?? null,
        isBaseline: scenarios.length === 0,
      });
      setScenarios(s => [...s, data.scenario]);
      setName('');
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDeleteScenario(id) {
    if (!confirm('Delete this saved scenario?')) return;
    setDeletingId(id);
    try {
      await deleteScenario(id);
      setScenarios(list => list.filter((row) => row.id !== id));
    } catch (e) {
      alert(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  if (!weddingId) return null;

  return (
    <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px', marginBottom:16 }}>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:'var(--maroon)', marginBottom:14 }}><FiBarChart2 style={{ verticalAlign:'middle', marginRight:8 }} />Scenario Comparison</div>
      {scenarios.length === 0 ? (
        <p style={{ fontSize:13, color:'var(--muted)', marginBottom:14 }}>Save the current estimate as a named scenario to compare options (e.g. "Palace vs City Hotel").</p>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:14 }}>
          {scenarios.map(s => (
            <div key={s.id} style={{ background:'var(--cream)', border:'1px solid var(--border)', borderRadius:8, padding:'14px', position:'relative' }}>
              <button
                type="button"
                onClick={() => handleDeleteScenario(s.id)}
                disabled={deletingId === s.id}
                style={{ position:'absolute', top:6, right:6, background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14, opacity:deletingId === s.id ? 0.5 : 1 }}
                title="Delete scenario"
              >
                <FiX />
              </button>
              <div style={{ fontWeight:700, fontSize:13, color:'var(--maroon)', marginBottom:4 }}>{s.label}</div>
              {s.budget_estimates && (
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, color:'var(--text)' }}>
                  {fmt(s.budget_estimates.total_min)} – {fmt(s.budget_estimates.total_max)}
                </div>
              )}
              {s.is_baseline && <span style={{ fontSize:9, background:'var(--maroon)', color:'#E8C97A', padding:'2px 6px', borderRadius:10, fontWeight:700 }}>BASELINE</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display:'flex', gap:8 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Scenario name e.g. Palace Option"
          style={{ flex:1, padding:'8px 12px', border:'1px solid var(--border)', borderRadius:7, fontSize:13, outline:'none' }} />
        <button onClick={handleSave} disabled={saving || !name.trim()}
          style={{ padding:'8px 16px', background:'var(--maroon)', border:'none', borderRadius:7, color:'#E8C97A', fontSize:12, fontWeight:700, cursor:'pointer', opacity: saving || !name.trim() ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save Scenario'}
        </button>
      </div>
    </div>
  );
}

// ── Budget Tracker ────────────────────────────────────────────────────────────
function BudgetTracker({ weddingId, estimatedItems }) {
  const [actuals, setActuals]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [adding, setAdding]     = useState(false);
  const [form, setForm]         = useState({ cost_head:'decor', line_item_label:'', actual_amount:'', vendor_name:'' });
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (weddingId) {
      setLoading(true);
      fetchActuals(weddingId).then(d => setActuals(d.actuals ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [weddingId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.line_item_label || !form.actual_amount) return;
    setSaving(true);
    try {
      const data = await addActual({ weddingId, ...form, actual_amount: parseInt(form.actual_amount) });
      setActuals(a => [data.actual, ...a]);
      setForm({ cost_head:'decor', line_item_label:'', actual_amount:'', vendor_name:'' });
      setAdding(false);
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this entry?')) return;
    await deleteActual(id).catch(() => {});
    setActuals(a => a.filter(x => x.id !== id));
  }

  const totalActual    = actuals.reduce((s, a) => s + (a.actual_amount ?? 0), 0);
  const totalEstimated = estimatedItems.reduce((s, i) => s + i.mid, 0);
  const diff           = totalActual - totalEstimated;

  if (!weddingId) return null;

  const inputStyle = { padding:'8px 10px', border:'1px solid var(--border)', borderRadius:7, fontSize:13, outline:'none', fontFamily:"'Jost',sans-serif" };

  return (
    <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px', marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:'var(--maroon)' }}><FiFileText style={{ verticalAlign:'middle', marginRight:8 }} />Actuals Tracker</div>
        <button onClick={() => setAdding(!adding)} style={{ padding:'7px 14px', background: adding ? 'transparent' : 'var(--maroon)', border:'1px solid var(--maroon)', borderRadius:7, color: adding ? 'var(--maroon)' : '#E8C97A', fontSize:12, fontWeight:700, cursor:'pointer' }}>
          {adding ? <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><FiX /> Cancel</span> : '+ Log Actual'}
        </button>
      </div>

      {/* Totals */}
      <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { label:'Total Estimated', value: fmt(totalEstimated), color:'var(--muted)' },
          { label:'Total Actual',    value: fmt(totalActual),    color: totalActual > totalEstimated ? '#dc2626' : '#15803d' },
          { label:'Variance',        value: `${diff >= 0 ? '+' : ''}${fmt(Math.abs(diff))}`, color: diff > 0 ? '#dc2626' : '#15803d' },
        ].map(item => (
          <div key={item.label} style={{ flex:1, minWidth:120, background:'var(--cream)', borderRadius:8, padding:'12px 14px' }}>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>{item.label}</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontWeight:700, color:item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <form onSubmit={handleAdd} style={{ background:'var(--cream)', borderRadius:8, padding:'14px', marginBottom:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            <div>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', display:'block', marginBottom:4 }}>Cost Head</label>
              <select value={form.cost_head} onChange={e => setForm(f => ({...f, cost_head: e.target.value}))} style={inputStyle}>
                {['decor','fb','artists','logistics','venue','sundries'].map(h => <option key={h} value={h}>{h.charAt(0).toUpperCase()+h.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', display:'block', marginBottom:4 }}>Item Label *</label>
              <input required value={form.line_item_label} onChange={e => setForm(f => ({...f, line_item_label: e.target.value}))} style={inputStyle} placeholder="e.g. Mandap Decor" />
            </div>
            <div>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', display:'block', marginBottom:4 }}>Actual Amount (₹) *</label>
              <input required type="number" step={50000} value={form.actual_amount} onChange={e => setForm(f => ({...f, actual_amount: e.target.value}))} style={inputStyle} placeholder="800000" />
            </div>
            <div>
              <label style={{ fontSize:10, color:'var(--muted)', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', display:'block', marginBottom:4 }}>Vendor Name</label>
              <input value={form.vendor_name} onChange={e => setForm(f => ({...f, vendor_name: e.target.value}))} style={inputStyle} placeholder="Vendor name" />
            </div>
          </div>
          <button type="submit" disabled={saving} style={{ padding:'8px 20px', background:'var(--maroon)', border:'none', borderRadius:7, color:'#E8C97A', fontSize:12, fontWeight:700, cursor:'pointer', opacity:saving?0.5:1 }}>
            {saving ? 'Saving…' : 'Log Entry'}
          </button>
        </form>
      )}

      {/* Actuals list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'20px', color:'var(--muted)', fontSize:13 }}>Loading…</div>
      ) : actuals.length === 0 ? (
        <div style={{ textAlign:'center', padding:'20px', color:'var(--muted)', fontSize:13 }}>No actuals logged yet. Use this to track real costs vs estimates.</div>
      ) : (
        <div>
          {actuals.map(a => (
            <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
              <div>
                <div style={{ fontWeight:600 }}>{a.line_item_label}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{a.cost_head} {a.vendor_name ? `· ${a.vendor_name}` : ''}</div>
              </div>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, fontWeight:700, color:'var(--maroon)' }}>{fmt(a.actual_amount)}</div>
                <button onClick={() => handleDelete(a.id)} style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:14 }}><FiX /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Report ───────────────────────────────────────────────────────────────
export default function Step7Report({ budget, inputs, setStep, weddingId }) {
  const { items, tMin, tMax, tMid } = budget;
  const { user } = useAuth();
  const [estimateId, setEstimateId] = useState(null);

  useEffect(() => {
    if (!user || !weddingId) {
      setEstimateId(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await calculateEstimate({ ...inputs, weddingId });
        if (data?.currentEstimateId) {
          setEstimateId(data.currentEstimateId);
        }
      } catch {
        // Non-blocking: local estimate UI remains usable even if save fails.
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [user, weddingId, inputs]);

  return (
    <div>
      {/* Hero total */}
      <div style={{ textAlign:'center', padding:'20px 0 28px' }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:13, letterSpacing:'3px', textTransform:'uppercase', color:'var(--muted)', marginBottom:8 }}>
          WeddingBudget.ai · Estimate Report
        </div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:50, fontWeight:700, color:'var(--maroon)', lineHeight:1.1 }}>
          {fmt(tMin)} – {fmt(tMax)}
        </div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, color:'var(--gold)', marginTop:8 }}>
          Midpoint: {fmt(tMid)}
        </div>
        <div style={{ fontSize:13, color:'var(--muted)', marginTop:10 }}>
          {inputs.guests} guests · {inputs.city} · {inputs.hotelTier} · {inputs.functions.size} functions
        </div>
      </div>

      {/* Stacked bar */}
      <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:14, marginBottom:16 }}>
        <div style={{ display:'flex', height:28, borderRadius:6, overflow:'hidden', gap:2 }}>
          {items.map((item, i) => (
            <div key={i} style={{ width:`${item.pct}%`, background:CAT_COLORS[i%CAT_COLORS.length], minWidth:3 }} title={item.cat} />
          ))}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:10 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:500 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:CAT_COLORS[i%CAT_COLORS.length] }} />
              {item.cat}
            </div>
          ))}
        </div>
      </div>

      {/* Line items */}
      {items.map((item, i) => (
        <div key={i} style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:15, display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:CAT_COLORS[i%CAT_COLORS.length], flexShrink:0 }} />
                {item.cat}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{item.sub}</div>
            </div>
            <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:'var(--maroon)', fontWeight:600 }}>
                {fmt(item.min)} – {fmt(item.max)}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>{item.pct}% of total</div>
            </div>
          </div>
          <div style={{ height:4, background:'#F0E8E0', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${item.pct}%`, background:CAT_COLORS[i%CAT_COLORS.length], borderRadius:2 }} />
          </div>
        </div>
      ))}

      {/* 3-scenario summary */}
      <div style={{ background:'var(--maroon)', borderRadius:12, padding:24, marginTop:8, textAlign:'center', marginBottom:16 }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:12, letterSpacing:'2px', textTransform:'uppercase', color:'rgba(232,201,122,0.7)', marginBottom:12 }}>
          Three-Scenario Summary
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
          {[
            { l:'Conservative', v:tMin, n:'Lean choices' },
            { l:'Expected',     v:tMid, n:'Balanced quality' },
            { l:'Luxury',       v:tMax, n:'Premium everything' },
          ].map(({ l, v, n }) => (
            <div key={l}>
              <div style={{ fontSize:10, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(232,201,122,0.65)' }}>{l}</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:700, color:'#E8C97A', margin:'4px 0' }}>{fmt(v)}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{n}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario comparison (logged-in clients only) */}
      {user && <ScenarioComparison weddingId={weddingId} estimateId={estimateId} />}

      {/* Budget tracker (logged-in clients only) */}
      {user && <BudgetTracker weddingId={weddingId} estimatedItems={items} />}

      {/* Actions */}
      <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:20, flexWrap:'wrap' }}>
        <BtnPrimary onClick={() => setStep(1)}>↺ Reconfigure</BtnPrimary>
        <ExportButton budget={budget} inputs={inputs} />
      </div>

      {!user && (
        <div style={{ textAlign:'center', marginTop:20, padding:'16px', background:'#fff', border:'1px solid var(--border)', borderRadius:12, fontSize:13, color:'var(--muted)' }}>
          <a href="/login" style={{ color:'var(--maroon)', fontWeight:700 }}>Sign in</a> to save this estimate, compare scenarios, and track actuals vs estimates.
        </div>
      )}
    </div>
  );
}