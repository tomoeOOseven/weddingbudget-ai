// Step2DecorLibrary.jsx — paginated decor cards from DB
import React, { useEffect, useMemo, useState } from 'react';
import { Card, FilterPills, fmt } from './ui.jsx';
import { fetchScrapedDecor } from '../api.js';
import { FiCheck, FiImage } from 'react-icons/fi';

function decorBoundsFromTag(tag) {
  if (tag === 'Budget') return { min: 1000, max: 15000 };
  if (tag === 'Mid-Range') return { min: 15001, max: 80000 };
  if (tag === 'Premium') return { min: 80001, max: 500000 };
  return { min: 0, max: 0 };
}

function rangePillColor(tag) {
  if (tag === 'Budget') return { bg: '#E8F8EE', fg: '#166534' };
  if (tag === 'Mid-Range') return { bg: '#FFF4DE', fg: '#9A5B00' };
  return { bg: '#FDE8E8', fg: '#991B1B' };
}

export default function Step2DecorLibrary({ inputs, toggle, refData, cm, hd }) {
  const [priceFilter, setPriceFilter] = useState('All');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [decors, setDecors] = useState([]);
  const [selectedMeta, setSelectedMeta] = useState({});

  const LIMIT = 24;

  useEffect(() => {
    setOffset(0);
  }, [priceFilter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchScrapedDecor({
      limit: LIMIT,
      offset,
      ...(priceFilter !== 'All' ? { priceRangeTag: priceFilter } : {}),
    })
      .then((data) => {
        if (!active) return;
        setDecors(data.images ?? []);
        setTotal(Number(data.count ?? 0));
      })
      .catch(() => {
        if (!active) return;
        setDecors([]);
        setTotal(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [offset, priceFilter]);

  const decorById = useMemo(() => {
    const map = { ...selectedMeta };
    decors.forEach((d) => {
      map[d.id] = d;
    });
    return map;
  }, [decors, selectedMeta]);

  const scrapedCount = Number(refData?.decor?.length ?? 0);

  if (scrapedCount === 0) {
    return (
      <div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>
          Decor Library
        </div>
        <div style={{ fontSize:14, color:'var(--muted)', marginBottom:20, fontWeight:300 }}>
          Scraped decor library is currently empty.
        </div>
        <div style={{
          background:'#fff', border:'2px dashed rgba(0,0,0,0.1)',
          borderRadius:12, padding:'48px 32px', textAlign:'center',
        }}>
          <div style={{ fontSize:48, marginBottom:12 }}><FiImage /></div>
          <div style={{ fontSize:16, fontWeight:600, color:'#333', marginBottom:8 }}>
            Decor Library - Coming next
          </div>
          <div style={{ fontSize:13, color:'#999', maxWidth:420, margin:'0 auto', lineHeight:1.6 }}>
            This module will be implemented in the next build step. The database schema and
            API routes are ready - the UI just needs wiring up.
          </div>
        </div>
      </div>
    );
  }

  const priceTabs = ['All', 'Budget', 'Mid-Range', 'Premium'];

  const visible = decors;

  function getCostRange(d) {
    const base = decorBoundsFromTag(d.priceRangeTag);
    return {
      min: Math.round(base.min * (hd?.decorMult ?? 1) * cm),
      max: Math.round(base.max * (hd?.decorMult ?? 1) * cm),
    };
  }

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
        <FilterPills options={priceTabs} active={priceFilter} onChange={setPriceFilter} />
      </div>

      {/* Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:12 }}>
        {loading && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'30px 20px', color:'var(--muted)' }}>
            Loading decor...
          </div>
        )}
        {visible.map(d => {
          const on = inputs.selectedDecors.has(d.id);
          const { min, max } = getCostRange(d);
          const tag = d.priceRangeTag || 'Premium';
          const pill = rangePillColor(tag);
          return (
            <div key={d.id} onClick={() => {
              toggle('selectedDecors', d.id);
              setSelectedMeta((prev) => ({ ...prev, [d.id]: d }));
            }} style={{
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
                    onError={e => { e.target.parentElement.innerHTML = `<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:32px;background:#f5f0eb">IMG</div>`; }} />
                </div>
              ) : (
                <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, background:'#f9f5ef' }}><FiImage /></div>
              )}

              <div style={{ padding:'10px 12px' }}>
                <div style={{ fontWeight:600, fontSize:12, marginBottom:4, lineHeight:1.3 }}>{d.label}</div>
                <div style={{ display:'flex', gap:4, marginBottom:6, flexWrap:'wrap' }}>
                  <span style={{ padding:'2px 8px', borderRadius:999, fontSize:9, fontWeight:700, background:pill.bg, color:pill.fg }}>{tag}</span>
                </div>
                <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:14, fontWeight:700, color:'var(--maroon)' }}>
                  {fmt(min)} – {fmt(max)}
                </div>
              </div>

              {on && <div style={{ position:'absolute', top:8, right:8, background:'var(--gold)', color:'#fff', borderRadius:'50%', width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700 }}><FiCheck /></div>}
            </div>
          );
        })}
        {!loading && visible.length === 0 && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'40px 20px', color:'var(--muted)' }}>
            No décor styles found for the selected price filter.
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

      {/* Selection summary */}
      {inputs.selectedDecors.size > 0 && (
        <Card style={{ background:'#FBF0DC', border:'1px solid var(--gold)', marginTop:16 }}>
          <div style={{ fontWeight:600, fontSize:13, color:'var(--maroon)', marginBottom:10 }}>
            {inputs.selectedDecors.size} design{inputs.selectedDecors.size > 1 ? 's' : ''} selected
          </div>
          {[...inputs.selectedDecors].map(dId => {
            const d = decorById[dId];
            if (!d) return null;
            const { min, max } = getCostRange(d);
            return (
              <div key={dId} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span>{d.label} · {d.priceRangeTag || 'Premium'}</span>
                <span style={{ color:'var(--maroon)', fontWeight:600 }}>{fmt(min)} – {fmt(max)}</span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}