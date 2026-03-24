// useBudget.js — central wizard state + live client-side budget calc
import { useState, useMemo, useCallback } from 'react';

function createInitialInputs() {
  return {
  city:        'udaipur',    // slug key — matches new API
  hotelTier:   'palace',
  rooms:       60,
  guests:      300,
  outstationPct: 60,
  functions:   new Set(['mehendi','sangeet','baraat','pheras','reception']),
  selectedDecors:    new Set(),
  selectedDecorMeta: {},
  selectedArtists:   new Set(),
  selectedArtistMeta: {},
  selectedMeals:     new Set(['welcome','gala']),
  barTier:           'wine',
  specialtyCounters: new Set(['chaat','mocktail']),
  transfers:   true,
  ghodi:       true,
  dholis:      2,
  sfx:         new Set(['cold-pyro']),
  roomBaskets: true,
  rituals:     true,
  gifts:       true,
  stationery:  true,
  photography: true,
  };
}

function ensureSet(value, fallbackSet) {
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return new Set(value);
  return new Set(fallbackSet);
}

function buildArtistPriceRanges(artists) {
  const values = (artists ?? [])
    .map((a) => Number(a.priceInr ?? a.costMin ?? a.costMax))
    .filter((v) => Number.isFinite(v));
  if (!values.length) {
    return {
      Budget: { min: 10000, max: 30000 },
      'Mid-Range': { min: 30001, max: 70000 },
      Premium: { min: 70001, max: 150000 },
    };
  }

  const min = Math.round(Math.min(...values));
  const max = Math.round(Math.max(...values));
  if (min === max) {
    const spread = Math.max(3000, Math.round(min * 0.15));
    return {
      Budget: { min: Math.max(1000, min - spread), max: min },
      'Mid-Range': { min: min + 1, max: min + spread },
      Premium: { min: min + spread + 1, max: min + spread * 2 },
    };
  }

  const step = (max - min) / 3;
  const budgetMax = Math.round(min + step);
  const midMax = Math.round(min + step * 2);
  return {
    Budget: { min, max: budgetMax },
    'Mid-Range': { min: budgetMax + 1, max: midMax },
    Premium: { min: midMax + 1, max },
  };
}

function artistTagFromValue(value, ranges) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (v <= ranges.Budget.max) return 'Budget';
  if (v <= ranges['Mid-Range'].max) return 'Mid-Range';
  return 'Premium';
}

function decorBoundsFromTag(tag) {
  if (tag === 'Budget') return { min: 1000, max: 15000 };
  if (tag === 'Mid-Range') return { min: 15001, max: 80000 };
  if (tag === 'Premium') return { min: 80001, max: 500000 };
  return null;
}

export function serializeBudgetInputs(inputs) {
  return {
    city: inputs.city,
    hotelTier: inputs.hotelTier,
    rooms: inputs.rooms,
    guests: inputs.guests,
    outstationPct: inputs.outstationPct,
    barTier: inputs.barTier,
    transfers: inputs.transfers,
    ghodi: inputs.ghodi,
    dholis: inputs.dholis,
    roomBaskets: inputs.roomBaskets,
    rituals: inputs.rituals,
    gifts: inputs.gifts,
    stationery: inputs.stationery,
    photography: inputs.photography,
    functions: [...inputs.functions],
    selectedDecors: [...inputs.selectedDecors],
    selectedArtists: [...inputs.selectedArtists],
    selectedMeals: [...inputs.selectedMeals],
    specialtyCounters: [...inputs.specialtyCounters],
    sfx: [...inputs.sfx],
  };
}

export function normalizeBudgetInputs(raw = {}) {
  const initial = createInitialInputs();
  const normalizedSfx = ensureSet(raw.sfx, initial.sfx);
  if (normalizedSfx.has('pyro') && !normalizedSfx.has('cold-pyro')) {
    normalizedSfx.delete('pyro');
    normalizedSfx.add('cold-pyro');
  }

  return {
    city: raw.city ?? initial.city,
    hotelTier: raw.hotelTier ?? initial.hotelTier,
    rooms: Number.isFinite(Number(raw.rooms)) ? Number(raw.rooms) : initial.rooms,
    guests: Number.isFinite(Number(raw.guests)) ? Number(raw.guests) : initial.guests,
    outstationPct: Number.isFinite(Number(raw.outstationPct)) ? Number(raw.outstationPct) : initial.outstationPct,
    functions: ensureSet(raw.functions, initial.functions),
    selectedDecors: ensureSet(raw.selectedDecors, initial.selectedDecors),
    selectedDecorMeta: {},
    selectedArtists: ensureSet(raw.selectedArtists, initial.selectedArtists),
    selectedArtistMeta: {},
    selectedMeals: ensureSet(raw.selectedMeals, initial.selectedMeals),
    barTier: raw.barTier ?? initial.barTier,
    specialtyCounters: ensureSet(raw.specialtyCounters, initial.specialtyCounters),
    transfers: typeof raw.transfers === 'boolean' ? raw.transfers : initial.transfers,
    ghodi: typeof raw.ghodi === 'boolean' ? raw.ghodi : initial.ghodi,
    dholis: Number.isFinite(Number(raw.dholis)) ? Number(raw.dholis) : initial.dholis,
    sfx: normalizedSfx,
    roomBaskets: typeof raw.roomBaskets === 'boolean' ? raw.roomBaskets : initial.roomBaskets,
    rituals: typeof raw.rituals === 'boolean' ? raw.rituals : initial.rituals,
    gifts: typeof raw.gifts === 'boolean' ? raw.gifts : initial.gifts,
    stationery: typeof raw.stationery === 'boolean' ? raw.stationery : initial.stationery,
    photography: typeof raw.photography === 'boolean' ? raw.photography : initial.photography,
  };
}

export function useBudget(refData) {
  const [inputs, setInputs] = useState(() => createInitialInputs());
  const [step, setStep]     = useState(1);

  const set    = useCallback((key, val) => setInputs(p => ({ ...p, [key]: val })), []);
  const toggle = useCallback((key, id, meta = null) => setInputs((p) => {
    const s = new Set(p[key]);
    const had = s.has(id);
    if (had) s.delete(id);
    else s.add(id);

    const next = { ...p, [key]: s };
    if (key === 'selectedArtists' && meta) {
      const map = { ...(p.selectedArtistMeta ?? {}) };
      if (had) delete map[id];
      else map[id] = meta;
      next.selectedArtistMeta = map;
    }
    if (key === 'selectedDecors' && meta) {
      const map = { ...(p.selectedDecorMeta ?? {}) };
      if (had) delete map[id];
      else map[id] = meta;
      next.selectedDecorMeta = map;
    }
    return next;
  }), []);
  const hydrateInputs = useCallback((nextInputs) => setInputs(normalizeBudgetInputs(nextInputs)), []);
  const resetInputs = useCallback(() => setInputs(createInitialInputs()), []);

  // ── cities / hotels are now slug-keyed objects, not arrays ──────────────────
  const citiesObj  = refData?.cities     ?? {};
  const hotelsObj  = refData?.hotelTiers ?? {};

  const cm = citiesObj[inputs.city]?.mult ?? 1.0;
  const hd = hotelsObj[inputs.hotelTier]  ?? { roomRate:8000, costMult:1.0, decorMult:1.0, label:inputs.hotelTier };
  const nFn = inputs.functions.size;

  const budget = useMemo(() => {
    const MEALS   = refData?.meals             ?? [];
    const BARS    = refData?.barTiers          ?? [];
    const CTRS    = refData?.specialtyCounters ?? [];
    const ARTISTS = refData?.artists           ?? [];
    const ARTIST_RANGES = refData?.artistRanges ?? buildArtistPriceRanges(ARTISTS);
    const DECORS  = refData?.decor             ?? [];
    // ── fixed field names: logistics (not logisticsRates), sfxItems (not sfx) ─
    const LR      = refData?.logistics         ?? {};
    const SFXL    = refData?.sfxItems          ?? [];
    const S       = refData?.sundries          ?? {};

    const items = [];

    // 1. Venue & Accommodation
    items.push({
      cat: 'Venue & Accommodation',
      sub: `${inputs.rooms} rooms · ${hd.label ?? 'Hotel'}`,
      min: inputs.rooms * (hd.roomRate ?? 8000) * 2 * cm * 0.85,
      max: inputs.rooms * (hd.roomRate ?? 8000) * 3 * cm * 1.20,
    });

    // 2. Décor & Design
    const baseDecorMinPerFn = 200000 * (hd.decorMult ?? 1) * cm;
    const baseDecorMaxPerFn = 500000 * (hd.decorMult ?? 1) * cm;

    if (inputs.selectedDecors.size > 0) {
      let selectedCount = 0;
      [...inputs.selectedDecors].forEach(dId => {
        const d = DECORS.find(x => x.id === dId) || inputs.selectedDecorMeta?.[dId];
        if (d) {
          selectedCount += 1;
          const range = decorBoundsFromTag(d.priceRangeTag);
          if (range) {
            items.push({
              cat: 'Décor & Design',
              sub: `${d.label} (${d.priceRangeTag})`,
              min: range.min * (hd.decorMult ?? 1) * cm,
              max: range.max * (hd.decorMult ?? 1) * cm,
            });
          } else {
            items.push({
              cat: 'Décor & Design', sub: d.label,
              min: (Number(d.costMin ?? d.cost_seed_min) || 0) * (hd.decorMult ?? 1) * cm * 0.9,
              max: (Number(d.costMax ?? d.cost_seed_max ?? d.costMin ?? d.cost_seed_min) || 0) * (hd.decorMult ?? 1) * cm * 1.1,
            });
          }
        }
      });

      const remainingFunctions = Math.max(0, nFn - selectedCount);
      if (remainingFunctions > 0) {
        items.push({
          cat: 'Décor & Design',
          sub: `${remainingFunctions} function${remainingFunctions > 1 ? 's' : ''} - baseline`,
          min: baseDecorMinPerFn * remainingFunctions,
          max: baseDecorMaxPerFn * remainingFunctions,
        });
      }
    } else {
      items.push({
        cat: 'Décor & Design',
        sub: `${nFn} functions - baseline`,
        min: baseDecorMinPerFn * nFn,
        max: baseDecorMaxPerFn * nFn,
      });
    }

    // 3. Food & Beverage
    let fbMin = 0, fbMax = 0;
    [...inputs.selectedMeals].forEach(mId => {
      const m = MEALS.find(x => x.id === mId || x.slug === mId);
      if (m) { fbMin += m.costMinPH * inputs.guests * cm * 0.9; fbMax += m.costMaxPH * inputs.guests * cm * 1.1; }
    });
    const bar = BARS.find(x => x.id === inputs.barTier || x.slug === inputs.barTier);
    if (bar) { fbMin += bar.costMinPH * inputs.guests * cm; fbMax += bar.costMaxPH * inputs.guests * cm; }
    [...inputs.specialtyCounters].forEach(cId => {
      const c = CTRS.find(x => x.id === cId || x.slug === cId);
      if (c) { fbMin += c.costMin * cm; fbMax += c.costMax * cm; }
    });
    fbMin += inputs.guests * 350 * nFn;
    fbMax += inputs.guests * 650 * nFn;
    items.push({ cat:'Food & Beverage', sub:`${inputs.guests} guests · ${inputs.selectedMeals.size} meals`, min:fbMin, max:fbMax });

    // 4. Artists & Entertainment
    if (inputs.selectedArtists.size > 0) {
      let aMin = 0, aMax = 0;
      [...inputs.selectedArtists].forEach(aId => {
        const a = ARTISTS.find(x => x.id === aId || x.slug === aId) || inputs.selectedArtistMeta?.[aId];
        if (a) {
          const baseValue = Number(a.priceInr ?? a.costMin ?? a.costMax);
          const tag = a.priceRangeTag || artistTagFromValue(baseValue, ARTIST_RANGES);
          const bucket = tag ? ARTIST_RANGES[tag] : null;
          if (bucket) {
            aMin += bucket.min;
            aMax += bucket.max;
          } else {
            aMin += Number(a.costMin) || 0;
            aMax += Number(a.costMax) || Number(a.costMin) || 0;
          }
        }
      });
      items.push({ cat:'Artists & Entertainment', sub:`${inputs.selectedArtists.size} acts`, min:aMin, max:aMax });
    }

    // 5. Logistics  ← fixed: uses LR.ghodiMin/ghodiMax/dholiUnitMin/dholiUnitMax
    let lMin = 0, lMax = 0;
    if (inputs.transfers) {
      const og = Math.round(inputs.guests * (inputs.outstationPct / 100));
      const v  = Math.ceil(og / (LR.vehiclePerHead ?? 3));
      lMin += v * (LR.vehicleRateMin ?? 4500) * 2;
      lMax += v * (LR.vehicleRateMax ?? 7000) * 2;
    }
    if (inputs.ghodi) {
      lMin += (LR.ghodiMin ?? 45000) * cm;
      lMax += (LR.ghodiMax ?? 90000) * cm;
    }
    lMin += inputs.dholis * (LR.dholiUnitMin ?? 15000) * cm;
    lMax += inputs.dholis * (LR.dholiUnitMax ?? 30000) * cm;
    [...inputs.sfx].forEach(sId => {
      const s = SFXL.find(x => x.id === sId || x.slug === sId);
      if (s) { lMin += s.cost * 0.9; lMax += s.cost * 1.3; }
    });
    if (lMin > 0) items.push({ cat:'Logistics', sub:'Transfers · Baraat · SFX', min:lMin, max:lMax });

    // 6. Sundries & Extras
    let sMin = 0, sMax = 0;
    if (inputs.roomBaskets) { sMin += inputs.rooms   * (S.roomBasketMin        ?? 1800); sMax += inputs.rooms   * (S.roomBasketMax        ?? 3500); }
    if (inputs.rituals)     { sMin += nFn            * (S.ritualPerFnMin       ?? 35000);sMax += nFn            * (S.ritualPerFnMax       ?? 75000);}
    if (inputs.gifts)       { sMin += inputs.guests  * (S.giftPerGuestMin      ?? 500);  sMax += inputs.guests  * (S.giftPerGuestMax      ?? 1500); }
    if (inputs.stationery)  { sMin += inputs.guests  * (S.stationeryPerGuestMin?? 200);  sMax += inputs.guests  * (S.stationeryPerGuestMax?? 500);  }
    if (inputs.photography) { sMin += (S.photographyMin ?? 180000) * cm;                sMax += (S.photographyMax ?? 550000) * cm; }
    const subtotalMin = items.reduce((t, i) => t + i.min, 0);
    const subtotalMax = items.reduce((t, i) => t + i.max, 0);
    sMin += subtotalMin * (S.contingencyPct ?? 0.05);
    sMax += subtotalMax * (S.contingencyPct ?? 0.05);
    if (sMin > 0) items.push({ cat:'Sundries & Extras', sub:'Gifts · Photography · Contingency', min:sMin, max:sMax });

    const tMin = Math.round(items.reduce((t, i) => t + i.min, 0));
    const tMax = Math.round(items.reduce((t, i) => t + i.max, 0));
    const tMid = Math.round((tMin + tMax) / 2);

    return {
      items: items.map(i => ({
        ...i,
        min: Math.round(i.min),
        max: Math.round(i.max),
        mid: Math.round((i.min + i.max) / 2),
        pct: tMid > 0 ? Math.round(((i.min + i.max) / 2 / tMid) * 100) : 0,
      })),
      tMin, tMax, tMid,
    };
  }, [inputs, cm, hd, nFn, refData]);

  return { inputs, set, toggle, hydrateInputs, resetInputs, step, setStep, budget, cm, hd };
}