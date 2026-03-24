// Step3Artists.jsx
import React, { useState } from 'react';
import { Card, FilterPills, fmt } from './ui.jsx';
import { FiCheck } from 'react-icons/fi';

export default function Step3Artists({ inputs, toggle, refData }) {
  const [aFilter, setAFilter] = useState('All');
  const artists = refData?.artists || [];
  const types   = ['All', ...new Set(artists.map(a => a.type))];
  const visible = artists.filter(a => aFilter === 'All' || a.type === aFilter);
  const totMin  = [...inputs.selectedArtists].reduce((s, id) => { const a = artists.find(x=>x.id===id); return s+(a?a.costMin:0); }, 0);
  const totMax  = [...inputs.selectedArtists].reduce((s, id) => { const a = artists.find(x=>x.id===id); return s+(a?a.costMax:0); }, 0);

  return (
    <div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>Artists & Entertainment</div>
      <div style={{ fontSize:14, color:'var(--muted)', marginBottom:20, fontWeight:300 }}>Book acts per function — fees are indicative, excluding travel & rider</div>
      <FilterPills options={types} active={aFilter} onChange={setAFilter} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {visible.map(a => {
          const on = inputs.selectedArtists.has(a.id);
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
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, color:'var(--maroon)', fontWeight:600, marginTop:4 }}>{fmt(a.costMin)} – {fmt(a.costMax)}</div>
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
