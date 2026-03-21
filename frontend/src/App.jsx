// App.jsx — client-facing wizard with auth + wedding selection
import React, { useEffect, useState } from 'react';
import { fetchReferenceData } from './api.js';
import { useBudget } from './useBudget.js';
import { LiveTicker, StepNav, NavBar } from './components/LiveTicker.jsx';
import Step1EventDetails  from './components/Step1EventDetails.jsx';
import Step2DecorLibrary  from './components/Step2DecorLibrary.jsx';
import Step3Artists       from './components/Step3Artists.jsx';
import Step4FB            from './components/Step4FB.jsx';
import Step5Logistics     from './components/Step5Logistics.jsx';
import Step6Sundries      from './components/Step6Sundries.jsx';
import Step7Report        from './components/Step7Report.jsx';
import { useAuth }        from './context/AuthContext.jsx';
import WeddingDashboard   from './pages/WeddingDashboard.jsx';
import { useNavigate }    from 'react-router-dom';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [refData, setRefData]   = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  // Null = show dashboard, object = active wedding (or {} for guest mode)
  const [activeWedding, setActiveWedding] = useState(null);

  useEffect(() => {
    fetchReferenceData()
      .then(d => { setRefData(d); setDataLoading(false); })
      .catch(() => {
        import('./fallbackData.js').then(m => {
          setRefData(m.default);
          setApiError(true);
          setDataLoading(false);
        });
      });
  }, []);

  const { inputs, set, toggle, step, setStep, budget, cm, hd } = useBudget(refData);

  // Auth loading
  if (authLoading) {
    return <Loader text="WeddingBudget.ai…" />;
  }

  // Logged in but haven't selected a wedding yet
  if (user && activeWedding === null) {
    return <WeddingDashboard onSelectWedding={(w) => setActiveWedding(w ?? {})} />;
  }

  // Data loading
  if (dataLoading) return <Loader text="Loading reference data…" />;

  const stepProps = { inputs, set, toggle, refData, cm, hd, budget, setStep, weddingId: activeWedding?.id };

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
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:24, fontWeight:700, color:'#E8C97A', letterSpacing:'1px', cursor: user ? 'pointer' : 'default' }}
            onClick={() => user && setActiveWedding(null)}>
            WeddingBudget<span style={{ color:'var(--gold)' }}>.ai</span>
          </div>
          <div style={{ fontSize:10, color:'rgba(232,201,122,0.6)', letterSpacing:'2.5px', textTransform:'uppercase', fontWeight:300 }}>
            {activeWedding?.name ?? 'India\'s Intelligent Wedding Cost Estimator'}
          </div>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          {user ? (
            <button onClick={() => setActiveWedding(null)} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:7, color:'rgba(232,201,122,0.7)', fontSize:11, padding:'6px 12px', cursor:'pointer' }}>
              ← My Weddings
            </button>
          ) : (
            <button onClick={() => navigate('/login')} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:7, color:'rgba(232,201,122,0.7)', fontSize:11, padding:'6px 12px', cursor:'pointer' }}>
              Sign in
            </button>
          )}
          <div style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(232,201,122,0.3)', borderRadius:8, padding:'10px 16px' }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'rgba(232,201,122,0.65)' }}>Live Estimate</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:18, fontWeight:700, color:'#E8C97A' }}>
              {budget.tMin >= 100000 ? `₹${(budget.tMin/100000).toFixed(1)}L` : '—'} — {budget.tMid >= 100000 ? `₹${(budget.tMid/100000).toFixed(1)}L` : '—'}
            </div>
          </div>
        </div>
      </div>

      {apiError && (
        <div style={{ background:'#FFF3CD', borderBottom:'1px solid #FDEEBA', padding:'8px 28px', fontSize:12, color:'#856404' }}>
          Backend not detected — running with bundled fallback data.
        </div>
      )}

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
      {text}
    </div>
  );
}