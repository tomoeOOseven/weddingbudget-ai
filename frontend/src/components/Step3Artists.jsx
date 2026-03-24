// Step3Artists.jsx
import React, { useState } from 'react';
import { Card, FilterPills, fmt } from './ui.jsx';
import { FiCheck } from 'react-icons/fi';

function getRangeFromArtist(a) {
  if (a?.contributionMin != null && a?.contributionMax != null) {
    return { min: Number(a.contributionMin), max: Number(a.contributionMax) };
  }
  return { min: Number(a?.costMin) || 0, max: Number(a?.costMax) || 0 };
}

function pillColor(tag) {
  if (tag === 'Budget') return { bg: '#E8F8EE', fg: '#166534' };
  if (tag === 'Mid-Range') return { bg: '#FFF4DE', fg: '#9A5B00' };
  return { bg: '#FDE8E8', fg: '#991B1B' };
}

export default function Step3Artists({ inputs, toggle, refData }) {
  const [aFilter, setAFilter] = useState('All');
  const artists = refData?.artists || [];
  const types   = ['All', ...new Set(artists.map(a => a.type))];
  const visible = artists.filter(a => aFilter === 'All' || a.type === aFilter);
  const totMin  = [...inputs.selectedArtists].reduce((s, id) => {
    const a = artists.find(x => x.id === id);
    if (!a) return s;
    const r = getRangeFromArtist(a);
    return s + r.min;
  }, 0);
  const totMax  = [...inputs.selectedArtists].reduce((s, id) => {
    const a = artists.find(x => x.id === id);
    if (!a) return s;
    const r = getRangeFromArtist(a);
    return s + r.max;
  }, 0);

  return (
    <div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>Artists & Entertainment</div>
      <div style={{ fontSize:14, color:'var(--muted)', marginBottom:20, fontWeight:300 }}>Book acts per function — fees are indicative, excluding travel & rider</div>
      <FilterPills options={types} active={aFilter} onChange={setAFilter} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {visible.map(a => {
          const on = inputs.selectedArtists.has(a.id);
          const range = getRangeFromArtist(a);
          const tag = a.priceRangeTag || 'Premium';
          const c = pillColor(tag);
          return (
            <div key={a.id} onClick={() => toggle('selectedArtists', a.id)} style={{
              background: on ? '#FBF0DC' : '#fff',
              border: on ? '2px solid var(--gold)' : '2px solid var(--border)',
              borderRadius:10, padding:16, cursor:'pointer',
              display:'flex', justifyContent:'space-between', alignItems:'center',
              transition:'all 0.15s',
            }}>
              <div>
                <div style={{ fontSize:10, letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--muted)', marginBottom:4 }}>{a.type}</div>
                <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>{a.label}</div>
                <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', padding:'3px 8px', borderRadius:999, fontSize:10, fontWeight:700, background:c.bg, color:c.fg }}>
                  {tag}
                </div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, color:'var(--maroon)', fontWeight:600, marginTop:4 }}>
                  {fmt(range.min)} – {fmt(range.max)}
                </div>
              </div>
              {on && <div style={{ fontSize:22, color:'var(--gold)' }}><FiCheck /></div>}
            </div>
          );
        })}
      </div>
      {inputs.selectedArtists.size > 0 && (
        <Card style={{ background:'#FBF0DC', border:'1px solid var(--gold)', marginTop:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:600, fontSize:13, color:'var(--maroon)' }}>{inputs.selectedArtists.size} acts selected</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, color:'var(--maroon)', fontWeight:700 }}>{fmt(totMin)} – {fmt(totMax)}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
