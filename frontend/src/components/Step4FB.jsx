// Step4FB.jsx
import React from 'react';
import { Card, Label, SubText, Chip, fmt } from './ui.jsx';

export default function Step4FB({ inputs, set, toggle, refData, cm }) {
  const meals = refData?.meals || [];
  const bars  = refData?.barTiers || [];
  const ctrs  = refData?.specialtyCounters || [];
  const mMin  = [...inputs.selectedMeals].reduce((s,id)=>{ const m=meals.find(x=>x.id===id); return s+(m?m.costMinPH*inputs.guests*cm:0); },0);
  const mMax  = [...inputs.selectedMeals].reduce((s,id)=>{ const m=meals.find(x=>x.id===id); return s+(m?m.costMaxPH*inputs.guests*cm:0); },0);

  return (
    <div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>Food & Beverage</div>
      <div style={{ fontSize:14, color:'var(--muted)', marginBottom:24, fontWeight:300 }}>Per-head estimation across meal types, bar setup, and specialty counters</div>
      <Card>
        <Label>Meal Events</Label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {meals.map(m => (
            <Chip key={m.id} on={inputs.selectedMeals.has(m.id)} onClick={() => toggle('selectedMeals', m.id)} style={{ justifyContent:'space-between' }}>
              <span>{m.label}</span>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:14, fontWeight:600, whiteSpace:'nowrap' }}>₹{m.costMinPH}–{m.costMaxPH}/head</span>
            </Chip>
          ))}
        </div>
        <SubText style={{ marginTop:10 }}>{inputs.guests} guests × {inputs.selectedMeals.size} meals = {fmt(mMin)} – {fmt(mMax)}</SubText>
      </Card>
      <Card>
        <Label>Bar Setup</Label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          {bars.map(b => (
            <div key={b.id} onClick={() => set('barTier', b.id)} style={{
              padding:16, borderRadius:8, textAlign:'center', cursor:'pointer',
              border: inputs.barTier === b.id ? '2px solid var(--gold)' : '2px solid var(--border)',
              background: inputs.barTier === b.id ? 'var(--gold-light)' : '#fff',
              transition:'all 0.15s',
            }}>
              <div style={{ fontWeight:600, marginBottom:4, fontSize:13 }}>{b.label}</div>
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:13, color: inputs.barTier === b.id ? 'var(--maroon)' : 'var(--muted)' }}>
                {b.costMinPH === 0 ? '—' : `₹${b.costMinPH}–${b.costMaxPH}/head`}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Label>Specialty Counters</Label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {ctrs.map(c => (
            <Chip key={c.id} on={inputs.specialtyCounters.has(c.id)} onClick={() => toggle('specialtyCounters', c.id)} style={{ justifyContent:'center', textAlign:'center', fontSize:12, padding:10 }}>
              {c.label}
            </Chip>
          ))}
        </div>
        <SubText>{inputs.specialtyCounters.size} counters · ₹25K–55K each</SubText>
      </Card>
    </div>
  );
}
