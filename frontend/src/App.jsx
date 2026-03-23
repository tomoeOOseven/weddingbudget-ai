// App.jsx — client-facing wizard with auth + wedding selection
import React, { useEffect, useRef, useState } from 'react';
import { calculateEstimate, fetchReferenceData, fetchWedding, fetchWeddingState, updateWedding, updateWeddingState } from './api.js';
import { useBudget, normalizeBudgetInputs, serializeBudgetInputs } from './useBudget.js';
import { LiveTicker, StepNav, NavBar } from './components/LiveTicker.jsx';
import Step1EventDetails  from './components/Step1EventDetails.jsx';
import Step2DecorLibrary  from './components/Step2DecorLibrary.jsx';
import Step3Artists       from './components/Step3Artists.jsx';
import Step4FB            from './components/Step4FB.jsx';
import Step5Logistics     from './components/Step5Logistics.jsx';
import Step6Sundries      from './components/Step6Sundries.jsx';
import Step7Report        from './components/Step7Report.jsx';
import { fmt }            from './components/ui.jsx';
import { useAuth }        from './context/AuthContext.jsx';
import WeddingDashboard   from './pages/WeddingDashboard.jsx';
import { Navigate, useNavigate } from 'react-router-dom';
import { FiLoader } from 'react-icons/fi';

function normalizeStep(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.max(1, Math.min(7, Math.floor(n)));
  return clamped;
}


function getQueryWeddingId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('wid');
}

function setQueryWeddingId(id) {
  const params = new URLSearchParams(window.location.search);
  if (id) params.set('wid', id);
  else params.delete('wid');
  const query = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

export default function App() {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [refData, setRefData]   = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [currentEstimateId, setCurrentEstimateId] = useState(null);
  // Null = show dashboard, object = active wedding (or {} for guest mode)
  const [activeWedding, setActiveWedding] = useState(null);
  const [hydratingWedding, setHydratingWedding] = useState(false);
  const [hydratingWizardState, setHydratingWizardState] = useState(false);
  const [weddingHydrationDone, setWeddingHydrationDone] = useState(false);
  const forceStepOneWeddingIdRef = useRef(null);

  useEffect(() => {
    fetchReferenceData()
      .then(d => { setRefData(d); setDataLoading(false); })
      .catch(() => { setDataLoading(false); });
  }, []);

  const { inputs, set, toggle, hydrateInputs, resetInputs, step, setStep, budget, cm, hd } = useBudget(refData);

  const handleSelectWedding = (wedding) => {
    const selected = wedding ?? {};
    if (wedding?.id) {
      setQueryWeddingId(wedding.id);
      // Opening from dashboard should always start from Event Details.
      forceStepOneWeddingIdRef.current = wedding.id;
      setStep(1);
    } else {
      setQueryWeddingId(null);
      setStep(1);
      setCurrentEstimateId(null);
    }
    setActiveWedding(selected);
  };

  useEffect(() => {
    if (authLoading || !user || isAdmin) {
      setWeddingHydrationDone(true);
      return;
    }

    const rememberedWeddingId = getQueryWeddingId();
    if (!rememberedWeddingId) {
      setWeddingHydrationDone(true);
      return;
    }

    setHydratingWedding(true);
    fetchWedding(rememberedWeddingId)
      .then((wedding) => {
        setActiveWedding(wedding);
      })
      .catch(() => {
        setQueryWeddingId(null);
        setActiveWedding(null);
      })
      .finally(() => {
        setHydratingWedding(false);
        setWeddingHydrationDone(true);
      });
  }, [authLoading, user, isAdmin]);

  useEffect(() => {
    if (!user || !weddingHydrationDone) return;

    const weddingId = activeWedding?.id;
    if (!weddingId) {
      setQueryWeddingId(null);
      setCurrentEstimateId(null);
      if (activeWedding === null) {
        resetInputs();
      }
      return;
    }

    setQueryWeddingId(weddingId);

    let cancelled = false;
    setHydratingWizardState(true);

    (async () => {
      let state = null;
      try {
        const resp = await fetchWeddingState(weddingId);
        state = resp?.state ?? null;
      } catch {
        state = null;
      }

      if (cancelled) return;

      const merged = normalizeBudgetInputs({
        city: state?.city_slug ?? activeWedding?.cities?.slug,
        hotelTier: state?.hotel_tier_slug ?? activeWedding?.hotel_tiers?.slug,
        rooms: state?.rooms_blocked ?? activeWedding.rooms_blocked,
        guests: state?.total_guests ?? activeWedding.total_guests,
        outstationPct: state?.outstation_pct ?? activeWedding.outstation_pct,
        functions: state?.function_ids,
        selectedDecors: state?.selected_decor_ids,
        selectedArtists: state?.selected_artist_ids,
        selectedMeals: state?.selected_meal_ids,
        barTier: state?.bar_tier_slug,
        specialtyCounters: state?.specialty_counter_ids,
        transfers: state?.transfers,
        ghodi: state?.ghodi,
        dholis: state?.dholis,
        sfx: state?.sfx_ids,
        roomBaskets: state?.room_baskets,
        rituals: state?.rituals,
        gifts: state?.gifts,
        stationery: state?.stationery,
        photography: state?.photography,
      });

      hydrateInputs(merged);

      if (forceStepOneWeddingIdRef.current === weddingId) {
        setStep(1);
        forceStepOneWeddingIdRef.current = null;
      } else {
        setStep(normalizeStep(state?.step));
      }
    })().finally(() => {
      if (!cancelled) setHydratingWizardState(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user, activeWedding?.id, weddingHydrationDone]);

  useEffect(() => {
    if (!weddingHydrationDone || activeWedding !== null) return;
    if (step !== 1) setStep(1);
  }, [step, activeWedding?.id, activeWedding, weddingHydrationDone]);

  useEffect(() => {
    setCurrentEstimateId(null);
  }, [activeWedding?.id]);

  useEffect(() => {
    if (!user || !activeWedding?.id) return;

    const weddingId = activeWedding.id;
    const payload = serializeBudgetInputs(inputs);

    const timer = setTimeout(() => {
      updateWeddingState(weddingId, { ...payload, step: normalizeStep(step) }).catch(() => {});
      updateWedding(weddingId, {
        total_guests: inputs.guests,
        rooms_blocked: inputs.rooms,
        outstation_pct: inputs.outstationPct,
      }).catch(() => {});
    }, 700);

    return () => clearTimeout(timer);
  }, [user, activeWedding?.id, inputs, step]);

  useEffect(() => {
    if (!user || !activeWedding?.id || hydratingWizardState) return;

    const timer = setTimeout(async () => {
      try {
        const data = await calculateEstimate({ ...inputs, weddingId: activeWedding.id });
        setCurrentEstimateId(data?.currentEstimateId ?? null);
      } catch {
        // Non-blocking: UI remains usable if persistence fails.
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [user, activeWedding?.id, inputs, hydratingWizardState]);

  // Auth loading
  if (authLoading) {
    return <Loader text="WeddingBudget.ai…" />;
  }

  if (hydratingWedding) {
    return <Loader text="Restoring your wedding workspace…" />;
  }

  if (hydratingWizardState) {
    return <Loader text="Restoring your customizations…" />;
  }

  if (user && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  // Logged in but haven't selected a wedding yet
  if (user && activeWedding === null && weddingHydrationDone) {
    return <WeddingDashboard onSelectWedding={handleSelectWedding} />;
  }

  // Data loading
  if (dataLoading) return <Loader text="Loading reference data…" />;
  if (!refData) return <Loader text="Backend unavailable. Please start API service." />;

  const stepProps = { inputs, set, toggle, refData, cm, hd, budget, setStep, weddingId: activeWedding?.id, estimateId: currentEstimateId };

  const STEPS = [
    <Step1EventDetails key={1} {...stepProps} />,
    <Step2DecorLibrary key={2} {...stepProps} />,
    <Step3Artists      key={3} {...stepProps} />,
    <Step4FB           key={4} {...stepProps} />,
    <Step5Logistics    key={5} {...stepProps} />,
    <Step6Sundries     key={6} {...stepProps} />,
    <Step7Report       key={7} {...stepProps} />,
  ];

  return (
    <div style={{ fontFamily:"'Jost',sans-serif", background:'var(--cream)', minHeight:'100vh' }}>
      {/* Header */}
      <div style={{ background:'var(--maroon)', padding:'16px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:700, color:'#E8C97A', cursor: user ? 'pointer' : 'default' }}
            onClick={() => user && setActiveWedding(null)}>
            WeddingBudget<span style={{ color:'var(--gold)' }}>.ai</span>
          </div>
          <div style={{ fontSize:10, color:'rgba(232,201,122,0.6)', letterSpacing:'2.5px', textTransform:'uppercase', fontWeight:300 }}>
            {activeWedding?.name ?? 'India\'s Intelligent Wedding Cost Estimator'}
          </div>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <button onClick={() => navigate('/')} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:999, color:'rgba(232,201,122,0.7)', fontSize:12, padding:'8px 14px', cursor:'pointer' }}>
            Home
          </button>
          {user ? (
            <>
              <button onClick={() => setActiveWedding(null)} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:999, color:'rgba(232,201,122,0.7)', fontSize:12, padding:'8px 14px', cursor:'pointer' }}>
                ← My Weddings
              </button>
              <button onClick={signOut} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:999, color:'rgba(232,201,122,0.7)', fontSize:12, padding:'8px 14px', cursor:'pointer' }}>
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/login')} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:999, color:'rgba(232,201,122,0.7)', fontSize:12, padding:'8px 14px', cursor:'pointer' }}>
              Sign in
            </button>
          )}
          <div style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:8, padding:'10px 16px' }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'rgba(232,201,122,0.65)' }}>Live Estimate</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontWeight:700, color:'#E8C97A' }}>
              {budget.tMin > 0 ? fmt(budget.tMin) : '—'} — {budget.tMax > 0 ? fmt(budget.tMax) : '—'}
            </div>
          </div>
        </div>
      </div>

      <StepNav step={step} setStep={setStep} />

      <div style={{ maxWidth:900, margin:'0 auto', padding:'24px 20px' }}>
        <LiveTicker budget={budget} step={step} />
        {STEPS[step - 1]}
      </div>

      {step < 7 && <NavBar step={step} setStep={setStep} guests={inputs.guests} city={inputs.city} />}
    </div>
  );
}

function Loader({ text }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:"'Cormorant Garamond',serif", fontSize:24, color:'var(--maroon)' }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:10 }}><FiLoader /> {text}</span>
    </div>
  );
}