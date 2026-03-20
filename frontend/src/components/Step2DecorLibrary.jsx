// Step2DecorLibrary.jsx — real images from DB + ML cost prediction
import React, { useState, useEffect } from 'react';
import { Card, Label, SubText, FilterPills, fmt } from './ui.jsx';
import { scoreDecor } from '../api.js';

export default function Step2DecorLibrary({ inputs, toggle, refData, cm, hd }) {
  const [dFilter, setDFilter] = useState('All');
  const [styleFilter, setStyleFilter] = useState('All');
  const [mlScores, setMlScores]       = useState({});
  const [scoring, setScoring]         = useState(false);

  const decors  = refData?.decor ?? [];
  const funs    = refData?.functions ?? [];
  const fnLabel = Object.fromEntries(funs.map(f => [f.id, f.label]));

  const styles  = ['All', ...new Set(decors.map(d => d.style).filter(Boolean))];
  const fnTabs  = ['All', ...funs.filter(f => inputs.functions.has(f.id)).map(f => f.label)];

  const visible = decors.filter(d => {
    const fnOk    = !inputs.functions.size || inputs.functions.has(d.function);
    const tabOk   = dFilter === 'All' || fnLabel[d.function] === dFilter;
    const styleOk = styleFilter === 'All' || d.style === styleFilter;
    return fnOk && tabOk && styleOk;
  });

  // Stable key: sorted IDs joined — changes whenever any item is added, removed, or swapped
  const selectedKey = [...inputs.selectedDecors].sort().join(',');

  // ML-score selections on change
  useEffect(() => {
    const selected = [...inputs.selectedDecors];
    if (!selected.length) return;
    const unscored = selected.filter(id => !mlScores[id]);
    if (!unscored.length) return;

    setScoring(true);
    const selections = unscored.map(id => {
      const d = decors.find(x => x.id === id);
      return d ? { decorId: id, label: d.label, function: d.function, style: d.style, complexity: d.complexity, costMin: d.costMin, costMax: d.costMax } : null;
    }).filter(Boolean);

    scoreDecor(selections, inputs.city, inputs.hotelTier)
      .then(data => {
        const scores = {};
        (data.scored ?? []).forEach(s => { scores[s.decorId] = s; });
        setMlScores(prev => ({ ...prev, ...scores }));
      })
      .catch(() => {})
      .finally(() => setScoring(false));
  }, [selectedKey, inputs.city, inputs.hotelTier]);

  function getCostRange(d) {
    const ml = mlScores[d.id];
    if (ml) return { min: ml.cost_min, max: ml.cost_max, isML: true, confidence: ml.confidence };
    return {
      min: Math.round((d.costMin ?? 0) * (hd?.decorMult ?? 1) * cm * 0.9),
      max: Math.round((d.costMax ?? 0) * (hd?.decorMult ?? 1) * cm * 1.1),
      isML: false, confidence: null,
    };
  }

  const COMPLEXITY_COLOR = { low:'#16a34a', medium:'#d97706', high:'#dc2626', ultra:'#7c3aed' };

  return (
    <div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>
        Décor Library
      </div>
      <div style={{ fontSize:14, color:'var(--muted)', marginBottom:20, fontWeight:300 }}>
        Browse {decors.filter(d => d.source === 'scraped').length > 0 ? `${decors.length} designs (${decors.filter(d=>d.source==='scraped').length} from our scraper) ·` : ''} AI maps style & complexity to cost ranges
      </div>

      {/* Filters */}
      <div style={{ marginBottom:16 }}>
        <FilterPills options={fnTabs} active={dFilter} onChange={setDFilter} />
        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          {styles.map(s => (
            <button key={s} onClick={() => setStyleFilter(s)}
              style={{ padding:'4px 12px', border:`1px solid ${styleFilter===s?'var(--maroon)':'var(--border)'}`, borderRadius:20, background:styleFilter===s?'var(--maroon)':'transparent', color:styleFilter===s?'#E8C97A':'var(--muted)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:12 }}>
        {visible.map(d => {
          const on = inputs.selectedDecors.has(d.id);
          const { min, max, isML, confidence } = getCostRange(d);
          return (
            <div key={d.id} onClick={() => toggle('selectedDecors', d.id)} style={{
              borderRadius:10, cursor:'pointer', overflow:'hidden',
              border: on ? '2px solid var(--gold)' : '2px solid var(--border)',
              background: on ? 'var(--gold-light)' : '#fff',
              position:'relative', transition:'all 0.15s',
              boxShadow: on ? '0 4px 12px rgba(196,151,61,0.2)' : 'none',
            }}>
              {/* Image */}
              {d.imageUrl ? (
                <div style={{ height:120, overflow:'hidden', background:'#f5f0eb' }}>
                  <img src={d.imageUrl} alt={d.label} style={{ width:'100%', height:'100%', objectFit:'cover' }}
                    onError={e => { e.target.parentElement.innerHTML = `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:32px;background:#f5f0eb">🌸</div>`; }} />
                </div>
              ) : (
                <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, background:'#f9f5ef' }}>🌸</div>
              )}

              <div style={{ padding:'10px 12px' }}>
                <div style={{ fontWeight:600, fontSize:12, marginBottom:4, lineHeight:1.3 }}>{d.label}</div>
                <div style={{ display:'flex', gap:4, marginBottom:6, flexWrap:'wrap' }}>
                  <span style={{ padding:'2px 6px', borderRadius:4, fontSize:9, fontWeight:600, background:'#EEE8E0', color:'#5A4035' }}>{d.style}</span>
                  {d.complexity && <span style={{ padding:'2px 6px', borderRadius:4, fontSize:9, fontWeight:700, background:`${COMPLEXITY_COLOR[d.complexity]}18`, color:COMPLEXITY_COLOR[d.complexity] }}>{d.complexity}</span>}
                  {d.source === 'scraped' && <span style={{ padding:'2px 6px', borderRadius:4, fontSize:9, background:'#e0f2fe', color:'#0369a1' }}>AI tagged</span>}
                </div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:13, fontWeight:600, color: on ? 'var(--maroon)' : 'var(--muted)' }}>
                  {fmt(min)} – {fmt(max)}
                </div>
                {isML && confidence && (
                  <div style={{ fontSize:9, color:'#15803d', marginTop:2 }}>🧠 ML · {Math.round(confidence*100)}% conf.</div>
                )}
              </div>

              {on && <div style={{ position:'absolute', top:8, right:8, background:'var(--gold)', color:'#fff', borderRadius:'50%', width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700 }}>✓</div>}
            </div>
          );
        })}
        {visible.length === 0 && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'40px 20px', color:'var(--muted)' }}>
            Select functions in Step 1 to see matching décor styles.
          </div>
        )}
      </div>

      {/* Selection summary */}
      {inputs.selectedDecors.size > 0 && (
        <Card style={{ background:'#FBF0DC', border:'1px solid var(--gold)', marginTop:16 }}>
          <div style={{ fontWeight:600, fontSize:13, color:'var(--maroon)', marginBottom:10 }}>
            {inputs.selectedDecors.size} design{inputs.selectedDecors.size > 1 ? 's' : ''} selected
            {scoring && <span style={{ fontSize:11, color:'var(--muted)', marginLeft:8 }}>🧠 Getting ML estimates…</span>}
          </div>
          {[...inputs.selectedDecors].map(dId => {
            const d = decors.find(x => x.id === dId);
            if (!d) return null;
            const { min, max, isML } = getCostRange(d);
            return (
              <div key={dId} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span>{d.label} {isML && <span style={{ fontSize:10, color:'#15803d' }}>🧠</span>}</span>
                <span style={{ color:'var(--maroon)', fontWeight:600 }}>{fmt(min)} – {fmt(max)}</span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}