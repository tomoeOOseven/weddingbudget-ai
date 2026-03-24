// Step3Artists.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card, FilterPills, fmt } from './ui.jsx';
import { fetchArtists } from '../api.js';
import { FiCheck, FiImage } from 'react-icons/fi';

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
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [artists, setArtists] = useState([]);
  const [selectedMeta, setSelectedMeta] = useState({});

  const LIMIT = 24;
  const types = ['All', 'DJ', 'Band', 'Singer', 'Folk', 'Anchor', 'Choreo', 'Myra', 'Other'];

  useEffect(() => {
    setOffset(0);
  }, [aFilter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchArtists({
      limit: LIMIT,
      offset,
      shuffle: true,
      ...(aFilter !== 'All' ? { type: aFilter } : {}),
    })
      .then((data) => {
        if (!active) return;
        setArtists(data.artists ?? []);
        setTotal(Number(data.total ?? 0));
      })
      .catch(() => {
        if (!active) return;
        setArtists([]);
        setTotal(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [offset, aFilter]);

  const artistById = useMemo(() => {
    const map = { ...selectedMeta };
    artists.forEach((a) => {
      map[a.id] = a;
    });
    return map;
  }, [artists, selectedMeta]);

  const totMin  = [...inputs.selectedArtists].reduce((s, id) => {
    const a = artistById[id];
    if (!a) return s;
    const r = getRangeFromArtist(a);
    return s + r.min;
  }, 0);
  const totMax  = [...inputs.selectedArtists].reduce((s, id) => {
    const a = artistById[id];
    if (!a) return s;
    const r = getRangeFromArtist(a);
    return s + r.max;
  }, 0);

  return (
    <div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>Artists & Entertainment</div>
      <div style={{ fontSize:14, color:'var(--muted)', marginBottom:20, fontWeight:300 }}>Book acts per function — fees are indicative, excluding travel & rider</div>
      <FilterPills options={types} active={aFilter} onChange={setAFilter} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:12 }}>
        {loading && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'30px 20px', color:'var(--muted)' }}>
            Loading artists...
          </div>
        )}
        {artists.map(a => {
          const on = inputs.selectedArtists.has(a.id);
          const range = getRangeFromArtist(a);
          const tag = a.priceRangeTag || 'Premium';
          const c = pillColor(tag);
          return (
            <div key={a.id} onClick={() => {
              toggle('selectedArtists', a.id);
              setSelectedMeta((prev) => ({ ...prev, [a.id]: a }));
            }} style={{
              background: on ? '#FBF0DC' : '#fff',
              border: on ? '2px solid var(--gold)' : '2px solid var(--border)',
              borderRadius:10, cursor:'pointer', overflow:'hidden',
              transition:'all 0.15s',
              boxShadow: on ? '0 4px 12px rgba(196,151,61,0.2)' : 'none',
            }}>
              {a.image_url ? (
                <div style={{ height:120, overflow:'hidden', background:'#f5f0eb' }}>
                  <img src={a.image_url} alt={a.label} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
              ) : (
                <div style={{ height:120, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, background:'#f9f5ef' }}><FiImage /></div>
              )}
              <div style={{ padding:'10px 12px' }}>
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

        {!loading && artists.length === 0 && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'40px 20px', color:'var(--muted)' }}>
            No artists found for the selected type.
          </div>
        )}
      </div>

      {total > LIMIT && (
        <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:16, justifyContent:'center' }}>
          <button
            style={{ padding:'8px 16px', border:'1px solid #e0d5c5', borderRadius:7, background: offset === 0 ? '#f9f9f9' : '#fff', color: offset === 0 ? '#ccc' : '#7a1c1c', cursor: offset === 0 ? 'default' : 'pointer', fontSize:12, fontWeight:600, fontFamily:"'Jost',sans-serif" }}
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
          >
            ← Prev
          </button>
          <span style={{ fontSize:12, color:'#888' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button
            style={{ padding:'8px 16px', border:'1px solid #e0d5c5', borderRadius:7, background: offset + LIMIT >= total ? '#f9f9f9' : '#fff', color: offset + LIMIT >= total ? '#ccc' : '#7a1c1c', cursor: offset + LIMIT >= total ? 'default' : 'pointer', fontSize:12, fontWeight:600, fontFamily:"'Jost',sans-serif" }}
            disabled={offset + LIMIT >= total}
            onClick={() => setOffset((o) => o + LIMIT)}
          >
            Next →
          </button>
        </div>
      )}

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
