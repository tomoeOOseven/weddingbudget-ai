// services/budgetService.js — async budget calculator using live Supabase data
// refData is the shaped object from /api/data/all

function requireFiniteNumber(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Missing DB-backed config: ${field}`);
  }
  return n;
}

function buildThreePriceRanges(minValue, maxValue) {
  const min = Math.round(Number(minValue));
  const max = Math.round(Number(maxValue));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return {
      Budget: { min: 10000, max: 30000 },
      'Mid-Range': { min: 30001, max: 70000 },
      Premium: { min: 70001, max: 150000 },
    };
  }

  if (min === max) {
    const spread = Math.max(3000, Math.round(min * 0.15));
    return {
      Budget: { min: Math.max(1000, min - spread), max: min },
      'Mid-Range': { min: min + 1, max: min + spread },
      Premium: { min: min + spread + 1, max: min + spread * 2 },
    };
  }

  const width = (max - min) / 3;
  const budgetMax = Math.round(min + width);
  const midMax = Math.round(min + width * 2);
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

function calculateBudget(inputs, refData) {
  const {
    city, hotelTier, rooms, guests, outstationPct, functions,
    selectedDecors = [], selectedArtists = [], selectedMeals = [],
    barTier, specialtyCounters = [],
    transfers = true, ghodi = true, dholis = 2, sfx = [],
    roomBaskets = true, rituals = true, gifts = true,
    stationery = true, photography = true,
  } = inputs;

  const cityCfg = refData.cities?.[city];
  const hotelCfg = refData.hotelTiers?.[hotelTier];
  if (!cityCfg) throw new Error(`City not found in DB config: ${city}`);
  if (!hotelCfg) throw new Error(`Hotel tier not found in DB config: ${hotelTier}`);

  const cm  = requireFiniteNumber(cityCfg.mult, `cities.multiplier (${city})`);
  const hd  = {
    label: hotelCfg.label,
    roomRate: requireFiniteNumber(hotelCfg.roomRate, `hotel_tiers.room_rate (${hotelTier})`),
    costMult: requireFiniteNumber(hotelCfg.costMult, `hotel_tiers.cost_mult (${hotelTier})`),
    decorMult: requireFiniteNumber(hotelCfg.decorMult, `hotel_tiers.decor_mult (${hotelTier})`),
  };
  const nFn = Array.isArray(functions) ? functions.length : (functions?.size ?? 1);
  const L   = refData.logistics;
  const S   = refData.sundries;
  if (!L) throw new Error('Missing DB-backed logistics config');
  if (!S) throw new Error('Missing DB-backed sundries config');

  const logistics = {
    vehiclePerHead: requireFiniteNumber(L.vehiclePerHead, 'logistics_rates.guests_per_vehicle'),
    vehicleRateMin: requireFiniteNumber(L.vehicleRateMin, 'logistics_rates.vehicle_rate_min'),
    vehicleRateMax: requireFiniteNumber(L.vehicleRateMax, 'logistics_rates.vehicle_rate_max'),
    ghodiMin: requireFiniteNumber(L.ghodiMin, 'logistics_rates.ghodi_min'),
    ghodiMax: requireFiniteNumber(L.ghodiMax, 'logistics_rates.ghodi_max'),
    dholiUnitMin: requireFiniteNumber(L.dholiUnitMin, 'logistics_rates.dholi_unit_min'),
    dholiUnitMax: requireFiniteNumber(L.dholiUnitMax, 'logistics_rates.dholi_unit_max'),
  };

  const sundries = {
    roomBasketMin: requireFiniteNumber(S.roomBasketMin, 'sundries_config.room_basket_min'),
    roomBasketMax: requireFiniteNumber(S.roomBasketMax, 'sundries_config.room_basket_max'),
    ritualPerFnMin: requireFiniteNumber(S.ritualPerFnMin, 'sundries_config.ritual_per_fn_min'),
    ritualPerFnMax: requireFiniteNumber(S.ritualPerFnMax, 'sundries_config.ritual_per_fn_max'),
    giftPerGuestMin: requireFiniteNumber(S.giftPerGuestMin, 'sundries_config.gift_per_guest_min'),
    giftPerGuestMax: requireFiniteNumber(S.giftPerGuestMax, 'sundries_config.gift_per_guest_max'),
    stationeryPerGuestMin: requireFiniteNumber(S.stationeryPerGuestMin, 'sundries_config.stationery_per_guest_min'),
    stationeryPerGuestMax: requireFiniteNumber(S.stationeryPerGuestMax, 'sundries_config.stationery_per_guest_max'),
    photographyMin: requireFiniteNumber(S.photographyMin, 'sundries_config.photography_min'),
    photographyMax: requireFiniteNumber(S.photographyMax, 'sundries_config.photography_max'),
    contingencyPct: requireFiniteNumber(S.contingencyPct, 'sundries_config.contingency_pct'),
  };
  const items = [];

  // 1. Venue & Accommodation
  const accMin = rooms * hd.roomRate * 2 * cm * 0.85;
  const accMax = rooms * hd.roomRate * 3 * cm * 1.20;
  items.push({ cat: 'Venue & Accommodation', sub: `${rooms} rooms · ${hd.label}`, min: accMin, max: accMax });

  // 2. Décor & Design
  const decorList = refData.decor ?? [];
  const baseDecorMinPerFn = 200000 * (hd.decorMult ?? 1) * cm;
  const baseDecorMaxPerFn = 500000 * (hd.decorMult ?? 1) * cm;
  if (selectedDecors.length > 0) {
    const arrDecors = Array.isArray(selectedDecors) ? selectedDecors : [...selectedDecors];
    let selectedCount = 0;
    arrDecors.forEach(dId => {
      const d = decorList.find(x => x.id === dId);
      if (d) {
        selectedCount += 1;
        const range = decorBoundsFromTag(d.priceRangeTag);
        if (range) {
          items.push({
            cat: 'Décor & Design', sub: `${d.label} (${d.priceRangeTag})`,
            min: range.min * (hd.decorMult ?? 1) * cm,
            max: range.max * (hd.decorMult ?? 1) * cm,
          });
        } else {
          items.push({
            cat: 'Décor & Design', sub: d.label,
            min: (d.costMin ?? 0) * (hd.decorMult ?? 1) * cm * 0.9,
            max: (d.costMax ?? 0) * (hd.decorMult ?? 1) * cm * 1.1,
          });
        }
      }
    });

    const remainingFunctions = Math.max(0, nFn - selectedCount);
    if (remainingFunctions > 0) {
      items.push({
        cat: 'Decor & Design',
        sub: `${remainingFunctions} function${remainingFunctions > 1 ? 's' : ''} - baseline`,
        min: baseDecorMinPerFn * remainingFunctions,
        max: baseDecorMaxPerFn * remainingFunctions,
      });
    }
  } else {
    items.push({ cat: 'Decor & Design', sub: `${nFn} functions - baseline`,
      min: baseDecorMinPerFn * nFn,
      max: baseDecorMaxPerFn * nFn });
  }

  // 3. Food & Beverage
  const mealList = refData.meals ?? [];
  const barList  = refData.barTiers ?? [];
  const counterList = refData.specialtyCounters ?? [];
  let fbMin = 0, fbMax = 0;
  const arrMeals = Array.isArray(selectedMeals) ? selectedMeals : [...selectedMeals];
  arrMeals.forEach(mId => {
    const m = mealList.find(x => x.id === mId || x.slug === mId);
    if (m) { fbMin += m.costMinPH * guests * cm * 0.9; fbMax += m.costMaxPH * guests * cm * 1.1; }
  });
  const bar = barList.find(x => x.id === barTier || x.slug === barTier) ?? barList[0];
  if (!bar) throw new Error('No active bar tier found in DB config');
  fbMin += bar.costMinPH * guests * cm;
  fbMax += bar.costMaxPH * guests * cm;
  const arrCounters = Array.isArray(specialtyCounters) ? specialtyCounters : [...specialtyCounters];
  arrCounters.forEach(cId => {
    const c = counterList.find(x => x.id === cId || x.slug === cId);
    if (c) { fbMin += c.costMin * cm; fbMax += c.costMax * cm; }
  });
  fbMin += guests * 350 * nFn;
  fbMax += guests * 650 * nFn;
  items.push({ cat: 'Food & Beverage', sub: `${guests} guests · ${arrMeals.length} meals · ${bar.label}`, min: fbMin, max: fbMax });

  // 4. Artists & Entertainment
  const artistList = refData.artists ?? [];
  const arrArtists = Array.isArray(selectedArtists) ? selectedArtists : [...selectedArtists];
  if (arrArtists.length > 0) {
    const artistValues = artistList
      .map((a) => Number(a.costMin ?? a.costMax))
      .filter((v) => Number.isFinite(v));
    const artistRanges = refData.artistRanges ?? buildThreePriceRanges(
      Math.min(...artistValues),
      Math.max(...artistValues)
    );
    let aMin = 0, aMax = 0;
    arrArtists.forEach(aId => {
      const a = artistList.find(x => x.id === aId || x.slug === aId);
      if (a) {
        const baseValue = Number(a.costMin ?? a.costMax);
        const tag = a.priceRangeTag || artistTagFromValue(baseValue, artistRanges);
        const bucket = artistRanges[tag] || null;
        if (bucket) {
          aMin += bucket.min;
          aMax += bucket.max;
        } else {
          aMin += Number(a.costMin) || 0;
          aMax += Number(a.costMax) || Number(a.costMin) || 0;
        }
      }
    });
    items.push({ cat: 'Artists & Entertainment', sub: `${arrArtists.length} acts`, min: aMin, max: aMax });
  }

  // 5. Logistics
  let lMin = 0, lMax = 0;
  if (transfers) {
    const outstationPercent = Number.isFinite(Number(outstationPct)) ? Number(outstationPct) : 0;
    const outGuests = Math.round(guests * (outstationPercent / 100));
    const vehicles  = Math.ceil(outGuests / logistics.vehiclePerHead);
    lMin += vehicles * logistics.vehicleRateMin * 2;
    lMax += vehicles * logistics.vehicleRateMax * 2;
  }
  if (ghodi) { lMin += logistics.ghodiMin * cm; lMax += logistics.ghodiMax * cm; }
  lMin += dholis * logistics.dholiUnitMin * cm;
  lMax += dholis * logistics.dholiUnitMax * cm;
  const sfxList = refData.sfxItems ?? [];
  const arrSfx  = Array.isArray(sfx) ? sfx : [...sfx];
  arrSfx.forEach(sId => {
    const s = sfxList.find(x => x.id === sId || x.slug === sId);
    if (s) { lMin += s.cost * 0.9; lMax += s.cost * 1.3; }
  });
  if (lMin > 0) items.push({ cat: 'Logistics', sub: 'Transfers · Baraat · SFX', min: lMin, max: lMax });

  // 6. Sundries & Extras
  let sMin = 0, sMax = 0;
  if (roomBaskets) { sMin += rooms * sundries.roomBasketMin; sMax += rooms * sundries.roomBasketMax; }
  if (rituals)     { sMin += nFn   * sundries.ritualPerFnMin; sMax += nFn * sundries.ritualPerFnMax; }
  if (gifts)       { sMin += guests * sundries.giftPerGuestMin; sMax += guests * sundries.giftPerGuestMax; }
  if (stationery)  { sMin += guests * sundries.stationeryPerGuestMin; sMax += guests * sundries.stationeryPerGuestMax; }
  if (photography) { sMin += sundries.photographyMin * cm; sMax += sundries.photographyMax * cm; }
  const subMin = items.reduce((t, i) => t + i.min, 0);
  const subMax = items.reduce((t, i) => t + i.max, 0);
  sMin += subMin * sundries.contingencyPct;
  sMax += subMax * sundries.contingencyPct;
  if (sMin > 0) items.push({ cat: 'Sundries & Extras', sub: 'Gifts · Photography · Contingency', min: sMin, max: sMax });

  const totalMin = items.reduce((t, i) => t + i.min, 0);
  const totalMax = items.reduce((t, i) => t + i.max, 0);
  const totalMid = (totalMin + totalMax) / 2;

  return {
    items: items.map(i => ({
      ...i,
      min: Math.round(i.min), max: Math.round(i.max), mid: Math.round((i.min + i.max) / 2),
      pct: totalMid > 0 ? Math.round(((i.min + i.max) / 2 / totalMid) * 100) : 0,
    })),
    summary: {
      conservative: Math.round(totalMin),
      expected:     Math.round(totalMid),
      luxury:       Math.round(totalMax),
    },
    meta: { city, hotelTier, guests, rooms, functions: Array.isArray(functions) ? functions : [...(functions ?? [])], cityMultiplier: cm, hotelLabel: hd.label },
  };
}

module.exports = { calculateBudget };