// components/ui.jsx — shared primitive components

import React from 'react';

export const fmt = (n) => {
  if (!n || n < 0) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${Math.round(n / 1000)}K`;
};

export const CAT_COLORS = ['#6B1E3A','#C4973D','#3A6B2A','#3A3A8B','#7A4A2A','#2A6B6B'];

export function Toggle({ on, onChange }) {
  return (
    <div onClick={onChange} style={{
      width:44, height:24, borderRadius:12,
      background: on ? 'var(--maroon)' : '#D0BFBF',
      position:'relative', cursor:'pointer',
      transition:'background 0.2s', display:'flex',
      alignItems:'center', padding:2, flexShrink:0,
    }}>
      <div style={{
        width:20, height:20, borderRadius:'50%', background:'#fff',
        transform: on ? 'translateX(20px)' : 'translateX(0)',
        transition:'transform 0.2s',
      }} />
    </div>
  );
}

export function Chip({ on, onClick, children, style = {} }) {
  return (
    <div onClick={onClick} style={{
      padding:'10px 16px', borderRadius:8,
      border: on ? '2px solid var(--gold)' : '2px solid var(--border)',
      background: on ? 'var(--gold-light)' : '#fff',
      cursor:'pointer', fontSize:13, fontWeight:500,
      color: on ? 'var(--maroon)' : 'var(--muted)',
      display:'flex', alignItems:'center', gap:8,
      transition:'all 0.15s', ...style,
    }}>
      {children}
      {on && <span style={{ marginLeft:'auto', color:'var(--gold)' }}>✓</span>}
    </div>
  );
}

export function Card({ children, style = {} }) {
  return (
    <div style={{
      background:'#fff', border:'1px solid var(--border)',
      borderRadius:12, padding:20, marginBottom:16, ...style,
    }}>
      {children}
    </div>
  );
}

export function Label({ children }) {
  return (
    <span style={{
      fontSize:11, fontWeight:600, letterSpacing:'1.5px',
      textTransform:'uppercase', color:'var(--muted)',
      marginBottom:8, display:'block',
    }}>
      {children}
    </span>
  );
}

export function SubText({ children, style = {} }) {
  return <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, ...style }}>{children}</div>;
}

export function BigNum({ children, gold = false }) {
  return (
    <div style={{
      fontFamily:"'Cormorant Garamond', serif", fontSize:20,
      fontWeight:600, color: gold ? 'var(--gold)' : 'var(--maroon)',
    }}>
      {children}
    </div>
  );
}

export function BtnPrimary({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background:'var(--maroon)', color:'#fff', padding:'12px 28px',
      borderRadius:8, border:'none', cursor:'pointer',
      fontFamily:"'Jost', sans-serif", fontSize:14, fontWeight:600, ...style,
    }}>
      {children}
    </button>
  );
}

export function BtnOutline({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background:'#fff', color:'var(--maroon)', padding:'12px 28px',
      borderRadius:8, border:'2px solid var(--maroon)', cursor:'pointer',
      fontFamily:"'Jost', sans-serif", fontSize:14, fontWeight:600, ...style,
    }}>
      {children}
    </button>
  );
}

export function FilterPills({ options, active, onChange }) {
  return (
    <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
      {options.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer',
          fontSize:12, fontWeight:600,
          background: active === t ? 'var(--maroon)' : '#E8D5B7',
          color: active === t ? '#fff' : 'var(--muted)',
          transition:'all 0.15s',
        }}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>
        {title}
      </div>
      <div style={{ fontSize:14, color:'var(--muted)', fontWeight:300 }}>
        {subtitle}
      </div>
    </div>
  );
}
