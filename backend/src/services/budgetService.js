// services/budgetService.js — async budget calculator using live Supabase data
// refData is the shaped object from /api/data/all

function calculateBudget(inputs, refData) {
  const {
    city, hotelTier, rooms, guests, outstationPct, functions,
    selectedDecors = [], selectedArtists = [], selectedMeals = [],
    barTier = 'wine', specialtyCounters = [],
    transfers = true, ghodi = true, dholis = 2, sfx = [],
    roomBaskets = true, rituals = true, gifts = true,
    stationery = true, photography = true,
  } = inputs;

  const cm  = refData.cities?.[city]?.mult ?? 1.0;
  const hd  = refData.hotelTiers?.[hotelTier] ?? { decorMult: 1.0, costMult: 1.0, roomRate: 8000, label: hotelTier };
  const nFn = Array.isArray(functions) ? functions.length : (functions?.size ?? 1);
  const L   = refData.logistics   ?? {};
  const S   = refData.sundries    ?? {};
  const items = [];

  // 1. Venue & Accommodation
  const accMin = rooms * hd.roomRate * 2 * cm * 0.85;
  const accMax = rooms * hd.roomRate * 3 * cm * 1.20;
  items.push({ cat: 'Venue & Accommodation', sub: `${rooms} rooms · ${hd.label}`, min: accMin, max: accMax });

  // 2. Décor & Design
  const decorList = refData.decor ?? [];
  if (selectedDecors.length > 0) {
    const arrDecors = Array.isArray(selectedDecors) ? selectedDecors : [...selectedDecors];
    arrDecors.forEach(dId => {
      const d = decorList.find(x => x.id === dId);
      if (d) items.push({
        cat: 'Décor & Design', sub: d.label,
        min: (d.costMin ?? 0) * (hd.decorMult ?? 1) * cm * 0.9,
        max: (d.costMax ?? 0) * (hd.decorMult ?? 1) * cm * 1.1,
      });
    });
  } else {
    items.push({ cat: 'Décor & Design', sub: `${nFn} functions — default estimate`,
      min: 200000 * (hd.decorMult ?? 1) * cm * nFn,
      max: 500000 * (hd.decorMult ?? 1) * cm * nFn });
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
  const bar = barList.find(x => x.id === barTier || x.slug === barTier) ?? barList[1] ?? { costMinPH: 0, costMaxPH: 0, label: 'Bar' };
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
    let aMin = 0, aMax = 0;
    arrArtists.forEach(aId => {
      const a = artistList.find(x => x.id === aId || x.slug === aId);
      if (a) { aMin += a.costMin; aMax += a.costMax; }
    });
    items.push({ cat: 'Artists & Entertainment', sub: `${arrArtists.length} acts`, min: aMin * 0.95, max: aMax * 1.05 });
  }

  // 5. Logistics
  let lMin = 0, lMax = 0;
  if (transfers) {
    const outGuests = Math.round(guests * ((outstationPct ?? 50) / 100));
    const vehicles  = Math.ceil(outGuests / (L.vehiclePerHead ?? 3));
    lMin += vehicles * (L.vehicleRateMin ?? 4500) * 2;
    lMax += vehicles * (L.vehicleRateMax ?? 7000) * 2;
  }
  if (ghodi) { lMin += (L.ghodiMin ?? 45000) * cm; lMax += (L.ghodiMax ?? 90000) * cm; }
  lMin += dholis * (L.dholiUnitMin ?? 15000) * cm;
  lMax += dholis * (L.dholiUnitMax ?? 30000) * cm;
  const sfxList = refData.sfxItems ?? [];
  const arrSfx  = Array.isArray(sfx) ? sfx : [...sfx];
  arrSfx.forEach(sId => {
    const s = sfxList.find(x => x.id === sId || x.slug === sId);
    if (s) { lMin += s.cost * 0.9; lMax += s.cost * 1.3; }
  });
  if (lMin > 0) items.push({ cat: 'Logistics', sub: 'Transfers · Baraat · SFX', min: lMin, max: lMax });

  // 6. Sundries & Extras
  let sMin = 0, sMax = 0;
  if (roomBaskets) { sMin += rooms * (S.roomBasketMin ?? 1800); sMax += rooms * (S.roomBasketMax ?? 3500); }
  if (rituals)     { sMin += nFn   * (S.ritualPerFnMin ?? 35000); sMax += nFn * (S.ritualPerFnMax ?? 75000); }
  if (gifts)       { sMin += guests * (S.giftPerGuestMin ?? 500); sMax += guests * (S.giftPerGuestMax ?? 1500); }
  if (stationery)  { sMin += guests * (S.stationeryPerGuestMin ?? 200); sMax += guests * (S.stationeryPerGuestMax ?? 500); }
  if (photography) { sMin += (S.photographyMin ?? 180000) * cm; sMax += (S.photographyMax ?? 550000) * cm; }
  const subMin = items.reduce((t, i) => t + i.min, 0);
  const subMax = items.reduce((t, i) => t + i.max, 0);
  sMin += subMin * (S.contingencyPct ?? 0.05);
  sMax += subMax * (S.contingencyPct ?? 0.05);
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