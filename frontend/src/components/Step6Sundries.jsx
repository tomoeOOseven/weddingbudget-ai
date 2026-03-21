// Step6Sundries.jsx
import React from 'react';
import { Card, SubText, Toggle, fmt } from './ui.jsx';

export default function Step6Sundries({ inputs, set, refData, cm }) {
  const nFn = inputs.functions.size;

  // Read from refData.sundries — falls back to sensible defaults if offline
  const S = refData?.sundries ?? {};
  const roomBasketMin         = S.roomBasketMin         ?? 1800;
  const roomBasketMax         = S.roomBasketMax         ?? 3500;
  const ritualPerFnMin        = S.ritualPerFnMin        ?? 35000;
  const ritualPerFnMax        = S.ritualPerFnMax        ?? 75000;
  const giftPerGuestMin       = S.giftPerGuestMin       ?? 500;
  const giftPerGuestMax       = S.giftPerGuestMax       ?? 1500;
  const stationeryPerGuestMin = S.stationeryPerGuestMin ?? 200;
  const stationeryPerGuestMax = S.stationeryPerGuestMax ?? 500;
  const photographyMin        = S.photographyMin        ?? 180000;
  const photographyMax        = S.photographyMax        ?? 550000;

  const rows = [
    {
      key: 'roomBaskets',
      label: 'Room Welcome Baskets',
      sub:   `${inputs.rooms} rooms · ${fmt(roomBasketMin)}–${fmt(roomBasketMax)}/room`,
      est:   `${fmt(inputs.rooms * roomBasketMin)} – ${fmt(inputs.rooms * roomBasketMax)}`,
    },
    {
      key: 'rituals',
      label: 'Ritual Materials',
      sub:   `${nFn} ceremonies · Haldi, Mehendi, Pheras setup`,
      est:   `${fmt(nFn * ritualPerFnMin)} – ${fmt(nFn * ritualPerFnMax)}`,
    },
    {
      key: 'gifts',
      label: 'Gift Hampers',
      sub:   `${inputs.guests} guests · ${fmt(giftPerGuestMin)}–${fmt(giftPerGuestMax)}/guest`,
      est:   `${fmt(inputs.guests * giftPerGuestMin)} – ${fmt(inputs.guests * giftPerGuestMax)}`,
    },
    {
      key: 'stationery',
      label: 'Stationery',
      sub:   'Invites, menu cards, signage, table numbers',
      est:   `${fmt(inputs.guests * stationeryPerGuestMin)} – ${fmt(inputs.guests * stationeryPerGuestMax)}`,
    },
    {
      key: 'photography',
      label: 'Photography & Videography',
      sub:   'Candid team + cinematic highlights reel',
      est:   `${fmt(photographyMin * cm)} – ${fmt(photographyMax * cm)}`,
    },
  ];

  return (
    <div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>
        Sundries & Basics
      </div>
      <div style={{ fontSize:14, color:'var(--muted)', marginBottom:24, fontWeight:300 }}>
        Incidentals and essentials that complete the wedding experience
      </div>

      {rows.map(({ key, label, sub, est }) => (
        <Card key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>{label}</div>
            <SubText>{sub}</SubText>
            {inputs[key] && (
              <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:17, color:'var(--maroon)', fontWeight:600, marginTop:6 }}>
                {est}
              </div>
            )}
          </div>
          <Toggle on={inputs[key]} onChange={() => set(key, !inputs[key])} />
        </Card>
      ))}

      <Card style={{ background:'#f9f5ef', border:'1px solid var(--border)' }}>
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          <strong style={{ color:'var(--maroon)' }}>Note:</strong> A {((S.contingencyPct ?? 0.05) * 100).toFixed(0)}% contingency buffer is automatically added to your total estimate to account for last-minute additions and vendor renegotiations.
        </div>
      </Card>
    </div>
  );
}