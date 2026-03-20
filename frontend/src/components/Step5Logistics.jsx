// Step5Logistics.jsx
import React from 'react';
import { Card, Label, SubText, Toggle, Chip, fmt } from './ui.jsx';

export default function Step5Logistics({ inputs, set, toggle, refData, cm }) {
  // ── fixed: sfxItems (not sfx), logistics (not logisticsRates), flat field names ──
  const sfxList = refData?.sfxItems ?? [];
  const LR      = refData?.logistics ?? {};

  const vehiclePerHead = LR.vehiclePerHead  ?? 3;
  const vehicleRateMin = LR.vehicleRateMin  ?? 4500;
  const vehicleRateMax = LR.vehicleRateMax  ?? 7000;
  const ghodiMin       = LR.ghodiMin        ?? 45000;
  const ghodiMax       = LR.ghodiMax        ?? 90000;
  const dholiUnitMin   = LR.dholiUnitMin    ?? 15000;
  const dholiUnitMax   = LR.dholiUnitMax    ?? 30000;

  const outstationN = Math.round(inputs.guests * inputs.outstationPct / 100);
  const vehiclesN   = Math.ceil(outstationN / vehiclePerHead);

  return (
    <div>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:600, color:'var(--maroon)', marginBottom:4 }}>
        Logistics
      </div>
      <div style={{ fontSize:14, color:'var(--muted)', marginBottom:24, fontWeight:300 }}>
        Guest transfers, Baraat procession, and special effects
      </div>

      {/* Transfers */}
      <Card style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>Guest Transfers</div>
          <SubText>
            {outstationN} outstation guests · {vehiclesN} Innova Crysta{vehiclesN !== 1 ? 's' : ''}
          </SubText>
          {inputs.transfers && (
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, color:'var(--maroon)', fontWeight:600, marginTop:6 }}>
              {fmt(vehiclesN * vehicleRateMin * 2)} – {fmt(vehiclesN * vehicleRateMax * 2)}
            </div>
          )}
        </div>
        <Toggle on={inputs.transfers} onChange={() => set('transfers', !inputs.transfers)} />
      </Card>

      {/* Ghodi + Dholi */}
      <Card>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>Ghodi (Baraat Horse)</div>
            <SubText>Traditional procession · {fmt(ghodiMin * cm)} – {fmt(ghodiMax * cm)}</SubText>
          </div>
          <Toggle on={inputs.ghodi} onChange={() => set('ghodi', !inputs.ghodi)} />
        </div>
        <div style={{ height:1, background:'var(--border)', margin:'0 0 16px' }} />
        <Label>Dhol Players: {inputs.dholis}</Label>
        <input type="range" min={0} max={8} value={inputs.dholis}
          onChange={e => set('dholis', +e.target.value)} />
        <SubText>
          {fmt(inputs.dholis * dholiUnitMin * cm)} – {fmt(inputs.dholis * dholiUnitMax * cm)}
        </SubText>
      </Card>

      {/* SFX */}
      <Card>
        <Label>Special Effects</Label>
        {sfxList.length === 0 ? (
          <SubText>SFX items load from the backend. Start the server to see options.</SubText>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {sfxList.map(sx => (
              <Chip key={sx.id} on={inputs.sfx.has(sx.id)} onClick={() => toggle('sfx', sx.id)}
                style={{ justifyContent:'space-between' }}>
                <span style={{ fontSize:12 }}>{sx.label}</span>
                <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, fontWeight:600, whiteSpace:'nowrap', marginLeft:8 }}>
                  {fmt(sx.cost)}
                </span>
              </Chip>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}