import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiArrowRight, FiGift, FiHome, FiLogIn, FiPlayCircle, FiUsers } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchHomepageContent } from '../api.js';

const FALLBACK_CARD_DESIGNS = [
  { imageUrl: '/cards/card-1.webp', canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHX05Aq_4&category=tAEwhV3GgCA&analyticsCorrelationId=19f52fa6-29f8-4bce-8f40-833138075e25&ui=eyJBIjp7fX0' },
  { imageUrl: '/cards/card-2.webp', canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHX05Aq_4&category=tAEwhV3GgCA&analyticsCorrelationId=2f84d2d1-7d5b-4eca-87aa-6dceb2e56148&ui=eyJBIjp7fX0' },
  { imageUrl: '/cards/card-3.webp', canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAF6Q0JILnc&category=tAEwhV3GgCA&analyticsCorrelationId=c701427e-197f-42c5-a918-b948f628c313&ui=eyJBIjp7fX0' },
  { imageUrl: '/cards/card-4.webp', canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAFAHubY-xY&category=tAEwhV3GgCA&analyticsCorrelationId=9a9b180d-7546-4b3f-b1bf-e89f2fa3cd9a&ui=eyJBIjp7fX0' },
  { imageUrl: '/cards/card-5.webp', canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHYRSfM2M&category=tAEwhV3GgCA&analyticsCorrelationId=d2ca7e22-e222-45d5-8435-6dc8fe6858f6&ui=eyJBIjp7fX0' },
];

const FALLBACK_GAMES = [
  {
    title: 'Joota Chupai Showdown',
    desc: 'The bride side hides the groom shoes and negotiates a playful ransom while the baraat cheers.',
    imageUrl: '/games/game-1.jpg',
  },
  {
    title: 'Guess The Couple Moment',
    desc: 'Guests decode story clues from photos and vows, then race to guess the couple memory first.',
    imageUrl: '/games/game-2.webp',
  },
  {
    title: 'Wedding Bingo',
    desc: 'Mark iconic moments like varmala smiles, dance circles, and emotional speeches on custom bingo cards.',
    imageUrl: '/games/game-3.webp',
  },
  {
    title: 'Ring Hunt Challenge',
    desc: 'Bride and groom search for the hidden ring in a playful bowl game with full family commentary.',
    imageUrl: '/games/game-4.webp',
  },
];

const TABS = [
  { id: 'problem', label: 'Home', icon: <FiHome /> },
  { id: 'games', label: 'Wedding Games', icon: <FiGift /> },
  { id: 'cards', label: 'Card Designs', icon: <FiPlayCircle /> },
];

function TabButton({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        color: active ? '#E8C97A' : 'rgba(232,201,122,0.72)',
        padding: '10px 16px 9px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
        cursor: 'pointer',
      }}
    >
      {icon} {label}
    </button>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, isAdmin, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('problem');
  const [cardIndex, setCardIndex] = useState(0);
  const [cardDesigns, setCardDesigns] = useState(FALLBACK_CARD_DESIGNS);
  const [games, setGames] = useState(FALLBACK_GAMES);
  const wheelRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    fetchHomepageContent()
      .then((data) => {
        if (!mounted) return;
        const nextCards = data?.content?.cards ?? [];
        const nextGames = data?.content?.games ?? [];
        if (nextCards.length) setCardDesigns(nextCards);
        if (nextGames.length && nextGames.every((g) => g.title && g.desc && g.imageUrl)) {
          setGames(nextGames);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  function nextCard() {
    setCardIndex((i) => (i + 1) % cardDesigns.length);
  }

  function prevCard() {
    setCardIndex((i) => (i - 1 + cardDesigns.length) % cardDesigns.length);
  }

  function handleWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - wheelRef.current < 300) return;
    wheelRef.current = now;
    if (e.deltaY > 0) nextCard();
    else prevCard();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', color: '#2D1520', fontFamily: "'Jost',sans-serif" }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'rgba(251,245,230,0.96)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e6d6bf',
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 700, color: '#6B1E3A' }}>
            WeddingBudget<span style={{ color: '#C4973D' }}>.ai</span>
          </div>
          <div style={{ fontSize: 10, color: '#7A5563', letterSpacing: '2.5px', textTransform: 'uppercase', fontWeight: 400 }}>
            Events By Athea x AI Budget Intelligence
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button onClick={() => navigate('/admin')} style={{ border: '1px solid #d6c4aa', background: '#fff', color: '#6B1E3A', borderRadius: 999, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Admin Console
            </button>
          )}
          {loading ? (
            <span style={{ color: '#7A5563', fontSize: 12 }}>Checking session...</span>
          ) : user ? (
            <>
              <button onClick={() => navigate('/app')} style={{ border: 'none', background: '#6B1E3A', color: '#E8C97A', borderRadius: 999, padding: '9px 16px', fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <FiUsers /> My Weddings
              </button>
              <button onClick={signOut} style={{ border: '1px solid #d6c4aa', background: '#fff', color: '#6B1E3A', borderRadius: 999, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/login')} style={{ border: 'none', background: '#6B1E3A', color: '#E8C97A', borderRadius: 999, padding: '9px 16px', fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <FiLogIn /> Sign In
            </button>
          )}
        </div>
      </header>

      <div style={{ background: 'var(--maroon-dark)', borderBottom: '1px solid rgba(232,201,122,0.18)', display: 'flex', gap: 2, flexWrap: 'wrap', padding: '0 28px' }}>
        {TABS.map((tab) => (
          <TabButton key={tab.id} active={activeTab === tab.id} icon={tab.icon} label={tab.label} onClick={() => setActiveTab(tab.id)} />
        ))}
      </div>

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '26px 20px 48px' }}>
        <section style={{ background: '#fff', border: '1px solid #e4d6c0', borderRadius: 18, padding: '22px 18px', boxShadow: '0 6px 24px rgba(89,35,50,0.08)' }}>
          {activeTab === 'problem' && (
            <div>
              <section
                style={{
                  borderRadius: 18,
                  padding: '24px 20px',
                  background: 'linear-gradient(135deg, #6B1E3A 0%, #3f1222 55%, #6B1E3A 100%)',
                  color: '#F8EDD7',
                  boxShadow: '0 14px 30px rgba(58, 14, 30, 0.25)',
                  marginBottom: 18,
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, color: 'rgba(232,201,122,0.85)' }}>
                  Luxury wedding planning, now data-backed
                </div>
                <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(30px, 5vw, 50px)', lineHeight: 1.02, marginBottom: 12 }}>
                  Plan smarter Indian wedding budgets with real intelligence.
                </h1>
                <p style={{ fontSize: 15, lineHeight: 1.65, color: 'rgba(248,237,215,0.9)', maxWidth: 760 }}>
                  WeddingBudget.ai helps planners and families move beyond rough guesswork, combining real references,
                  city-sensitive logic, and service-level detail into one estimate workflow.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                  <button onClick={() => navigate('/app')} style={{ background: '#E8C97A', color: '#3f1222', border: 'none', borderRadius: 9, padding: '11px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                    Start Estimating
                  </button>
                </div>
              </section>

              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, marginBottom: 8, color: '#2D1520' }}>Where WeddingBudget.ai Helps</h2>
              <p style={{ color: '#5a3543', lineHeight: 1.8, fontSize: 15 }}>
                In most Indian weddings, budgets are still created from intuition, legacy spreadsheets, and memory from
                past events. That makes early planning vulnerable to underestimation across city, venue category, guest
                volume, decor style, artist selection, and logistics complexity.
              </p>
              <p style={{ color: '#5a3543', lineHeight: 1.8, fontSize: 15, marginTop: 12 }}>
                WeddingBudget.ai brings those decisions into one AI-assisted system: reference-driven decor intelligence,
                scenario-based budgeting, and client-facing ranges with itemized breakdowns so teams can plan with
                confidence from day one.
              </p>
            </div>
          )}

          {activeTab === 'games' && (
            <div>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, marginBottom: 8, color: '#2D1520' }}>Fun Wedding Games</h2>
              <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
                {games.map((game, i) => (
                  <article key={`${game.title}-${i}`} style={{ border: '1px solid #ecdcc4', borderRadius: 14, background: '#fffdf9', overflow: 'hidden' }}>
                    <img src={game.imageUrl} alt={game.title} style={{ width: '100%', height: 'clamp(180px, 33vw, 290px)', objectFit: 'cover', display: 'block' }} />
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 800, color: '#6B1E3A', marginBottom: 4 }}>{game.title}</div>
                      <div style={{ color: '#5a3543', fontSize: 14, lineHeight: 1.6 }}>{game.desc}</div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'cards' && (
            <div>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, marginBottom: 8, color: '#2D1520' }}>Wedding Card Designs</h2>

              <div style={{ position: 'relative', overscrollBehavior: 'contain' }} onWheelCapture={handleWheel}>
                <div style={{ overflow: 'hidden', borderRadius: 14, border: '1px solid #ead7be', background: '#f8efe1', overscrollBehavior: 'contain' }}>
                  <div
                    style={{
                      display: 'flex',
                      width: `${cardDesigns.length * 100}%`,
                      transform: `translateX(-${cardIndex * (100 / cardDesigns.length)}%)`,
                      transition: 'transform 360ms ease',
                    }}
                  >
                    {cardDesigns.map((card, i) => (
                      <div key={`${card.canvaUrl}-${i}`} style={{ width: `${100 / cardDesigns.length}%`, padding: 12, flexShrink: 0 }}>
                        <a href={card.canvaUrl} target="_blank" rel="noreferrer" title="Open design in Canva" style={{ display: 'block' }} onWheelCapture={handleWheel}>
                          <img
                            src={card.imageUrl}
                            alt={`Wedding card design ${i + 1}`}
                            style={{ width: '100%', height: 'min(78vh, 920px)', objectFit: 'contain', borderRadius: 12, background: '#fff', boxShadow: '0 10px 25px rgba(33,13,22,0.24)' }}
                          />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={prevCard} aria-label="Previous card" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', borderRadius: 999, width: 38, height: 38, display: 'grid', placeItems: 'center', background: 'rgba(35,12,20,0.75)', color: '#fff' }}>
                  <FiArrowLeft />
                </button>
                <button onClick={nextCard} aria-label="Next card" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', borderRadius: 999, width: 38, height: 38, display: 'grid', placeItems: 'center', background: 'rgba(35,12,20,0.75)', color: '#fff' }}>
                  <FiArrowRight />
                </button>
              </div>

              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 8 }}>
                {cardDesigns.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCardIndex(i)}
                    aria-label={`Go to card ${i + 1}`}
                    style={{ width: i === cardIndex ? 22 : 8, height: 8, borderRadius: 999, border: 'none', background: i === cardIndex ? '#6B1E3A' : '#ccb59d', transition: 'all 180ms ease' }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer style={{ borderTop: '1px solid #e1ceb3', background: 'rgba(251,245,230,0.96)', padding: '18px 28px 20px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, color: '#6B1E3A', marginBottom: 6 }}>About us</div>
          <div style={{ color: '#5a3543', fontSize: 14, lineHeight: 1.8 }}>
            Events By Athea &nbsp;|&nbsp; Event Planner &nbsp;|&nbsp; Bespoke Wedding Designers and Luxury Events &nbsp;|&nbsp; <a href="https://www.instagram.com/eventsbyathea/" target="_blank" rel="noreferrer" style={{ color: '#6B1E3A', fontWeight: 700, textDecoration: 'none' }}>@eventsbyathea</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
