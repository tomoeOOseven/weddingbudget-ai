// components/LiveTicker.jsx
import React from 'react';
import { fmt } from './ui.jsx';
import { FiCheck } from 'react-icons/fi';

const STEP_LABELS = ['Event Details','Décor Library','Artists','Food & Beverage','Logistics','Sundries','Budget Report'];

export function LiveTicker({ budget, step }) {
  return (
    <div style={{
      background:'var(--gold-light)', border:'1px solid var(--gold)',
      borderRadius:10, padding:'12px 20px', marginBottom:20,
      display:'flex', gap:20, alignItems:'center', flexWrap:'wrap',
    }}>
      <div>
        <div style={{ fontSize:10, fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--muted)' }}>Live Estimate Range</div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:700, color:'var(--maroon)' }}>
          {fmt(budget.tMin)} — {fmt(budget.tMax)}
        </div>
      </div>
      <div style={{ width:1, height:36, background:'var(--gold)' }} />
      <div>
        <div style={{ fontSize:10, fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--muted)' }}>Midpoint</div>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:700, color:'var(--gold)' }}>
          {fmt(budget.tMid)}
        </div>
      </div>
      <div style={{ marginLeft:'auto', fontSize:12, color:'var(--muted)', textAlign:'right' }}>
        {budget.items.length} cost heads · Step {step}/7
      </div>
    </div>
  );
}

export function StepNav({ step, setStep }) {
  return (
    <div style={{ background:'var(--maroon-dark)', overflowX:'auto' }}>
      <div style={{ display:'flex', minWidth:'max-content', padding:'0 16px' }}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done   = step > n;
          return (
            <button key={n} onClick={() => setStep(n)} style={{
              padding:'12px 16px', fontSize:11, fontWeight:600,
              letterSpacing:'1px', textTransform:'uppercase',
              color: done ? 'var(--gold)' : active ? '#E8C97A' : 'rgba(255,255,255,0.38)',
              background:'none', border:'none',
              borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
              cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.2s',
            }}>
              {done ? <FiCheck style={{ verticalAlign:'middle' }} /> : null} {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NavBar({ step, setStep, guests, city }) {
  return (
    <div style={{
      background:'#fff', borderTop:'1px solid var(--border)',
      padding:'14px 28px', display:'flex', justifyContent:'space-between',
      alignItems:'center', position:'sticky', bottom:0, zIndex:10,
    }}>
      <button
        disabled={step <= 1}
        onClick={() => step > 1 && setStep(step - 1)}
        style={{
          padding:'12px 28px', borderRadius:8,
          border:'2px solid var(--maroon)', background:'#fff',
          color:'var(--maroon)', fontFamily:"'Jost',sans-serif",
          fontSize:14, fontWeight:600, cursor: step > 1 ? 'pointer' : 'default',
          opacity: step > 1 ? 1 : 0.3,
        }}
      >
        ← Previous
      </button>
      <div style={{ fontSize:12, color:'var(--muted)' }}>{guests} guests · {city} · Step {step}/7</div>
      <button
        onClick={() => setStep(step + 1)}
        style={{
          padding:'12px 28px', borderRadius:8, border:'none',
          background:'var(--maroon)', color:'#fff',
          fontFamily:"'Jost',sans-serif", fontSize:14, fontWeight:600, cursor:'pointer',
        }}
      >
        {step === 6 ? 'Generate Report →' : 'Next →'}
      </button>
    </div>
  );
}
