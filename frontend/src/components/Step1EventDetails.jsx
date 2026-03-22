// Step1EventDetails.jsx
import React from 'react';
import { Card, Label, SubText, BigNum, Chip, fmt } from './ui.jsx';
import { FiCalendar, FiFeather, FiGift, FiMusic, FiStar, FiSun, FiUsers } from 'react-icons/fi';

const FUNCTION_ICON = {
  haldi: FiSun,
  mehendi: FiFeather,
  sangeet: FiMusic,
  baraat: FiUsers,
  pheras: FiStar,
  reception: FiGift,
  other: FiCalendar,
};

export default function Step1EventDetails({ inputs, set, toggle, refData, cm, hd }) {
  // cities and hotelTiers are now slug-keyed objects e.g. { udaipur: { mult, label }, ... }
  const citiesObj  = refData?.cities     ?? {};
  const hotelsObj  = refData?.hotelTiers ?? {};
  const funs       = refData?.functions  ?? [];

  // Convert to sorted arrays for rendering dropdowns
  const cityList  = Object.entries(citiesObj).map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const hotelList = Object.entries(hotelsObj).map(([slug, v]) => ({ slug, ...v }));

  return (
    <div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>
        Event Details
      </div>
      <div style={{ fontSize:14, color:'var(--muted)', marginBottom:24, fontWeight:300 }}>
        Set the foundation — city, venue tier, and guest parameters
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card>
          <Label>Wedding City</Label>
          <select value={inputs.city} onChange={e => set('city', e.target.value)}>
            {cityList.map(c => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
          <SubText>Cost index: {cm.toFixed(2)}× baseline (Hyderabad = 1.0)</SubText>
        </Card>

        <Card>
          <Label>Venue / Hotel Tier</Label>
          <select value={inputs.hotelTier} onChange={e => set('hotelTier', e.target.value)}>
            {hotelList.map(h => (
              <option key={h.slug} value={h.slug}>{h.label}</option>
            ))}
          </select>
          <SubText>Base room rate: ₹{(hd.roomRate ?? 8000).toLocaleString()}/night</SubText>
        </Card>
      </div>

      <Card>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div>
            <Label>Rooms Blocked: {inputs.rooms}</Label>
            <input type="range" min={10} max={300} value={inputs.rooms}
              onChange={e => set('rooms', +e.target.value)} />
          </div>
          <div>
            <Label>Total Guests: {inputs.guests}</Label>
            <input type="range" min={50} max={2000} step={25} value={inputs.guests}
              onChange={e => set('guests', +e.target.value)} />
          </div>
          <div>
            <Label>Outstation Guests: {inputs.outstationPct}%</Label>
            <input type="range" min={0} max={100} value={inputs.outstationPct}
              onChange={e => set('outstationPct', +e.target.value)} />
            <SubText>{Math.round(inputs.guests * inputs.outstationPct / 100)} guests need airport/station transfers</SubText>
          </div>
          <div>
            <Label>Accommodation Estimate</Label>
            <BigNum>
              {fmt(inputs.rooms * (hd.roomRate ?? 8000) * 2 * cm)} – {fmt(inputs.rooms * (hd.roomRate ?? 8000) * 3 * cm)}
            </BigNum>
            <SubText>{inputs.rooms} rooms × 2–3 nights</SubText>
          </div>
        </div>
      </Card>

      <Card>
        <Label>Functions / Events</Label>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {funs.map(f => (
            <Chip key={f.id} on={inputs.functions.has(f.id)} onClick={() => toggle('functions', f.id)}>
              {(() => {
                const Icon = FUNCTION_ICON[f.id] || FiCalendar;
                return <span style={{ fontSize:16, display:'inline-flex' }}><Icon /></span>;
              })()}
              {f.label}
            </Chip>
          ))}
        </div>
        <SubText style={{ marginTop:10 }}>{inputs.functions.size} functions selected</SubText>
      </Card>
    </div>
  );
}