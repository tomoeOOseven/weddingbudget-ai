import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiArrowRight, FiExternalLink, FiGift, FiHome, FiInfo, FiLogIn, FiMapPin, FiPlayCircle, FiUsers } from 'react-icons/fi';
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
  { title: 'Shoe Steal (Joota Chupai)', desc: 'Bride side hides the groom shoes during rituals and negotiates a playful ransom.' },
  { title: 'Couple Trivia Sprint', desc: 'Fast quiz about the bride and groom. Family team with highest score wins.' },
  { title: 'Wedding Bingo', desc: 'Guests mark moments like baraat dance, varmala, and emotional speeches on custom bingo cards.' },
  { title: 'Ring Hunt in Flower Bowl', desc: 'Bride and groom search for the ring in a flower bowl. Best of three rounds adds fun competition.' },
];

const TABS = [
  { id: 'problem', label: 'Problem Statement', icon: <FiInfo /> },
  { id: 'about', label: 'About Us', icon: <FiHome /> },
  { id: 'games', label: 'Wedding Games', icon: <FiGift /> },
  { id: 'cards', label: 'Card Designs', icon: <FiPlayCircle /> },
];

function TabButton({ active, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 999,
        background: active ? '#6B1E3A' : '#fff',
        color: active ? '#E8C97A' : '#5a3543',
        padding: '10px 16px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        fontWeight: 700,
        boxShadow: active ? '0 10px 20px rgba(107, 30, 58, 0.25)' : '0 1px 5px rgba(0,0,0,0.08)',
      }}
    >
      {icon} {label}
    </button>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
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
        if (nextGames.length) setGames(nextGames);
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
    const now = Date.now();
    if (now - wheelRef.current < 300) return;
    wheelRef.current = now;
    if (e.deltaY > 0) nextCard();
    else prevCard();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1200px 700px at 15% -15%, #f5e8c8 0%, #FBF5E6 45%, #f8efe1 100%)', color: '#2D1520' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'rgba(251,245,230,0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e6d6bf',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 33, fontWeight: 700, color: '#6B1E3A' }}>
            WeddingBudget<span style={{ color: '#C4973D' }}>.ai</span>
          </div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#7A5563' }}>
            Events By Athea x AI Budget Intelligence
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button onClick={() => navigate('/admin')} style={{ border: '1px solid #d6c4aa', background: '#fff', color: '#6B1E3A', borderRadius: 999, padding: '8px 14px', fontWeight: 700, fontSize: 12 }}>
              Admin Console
            </button>
          )}
          {loading ? (
            <span style={{ color: '#7A5563', fontSize: 12 }}>Checking session...</span>
          ) : user ? (
            <button onClick={() => navigate('/app')} style={{ border: 'none', background: '#6B1E3A', color: '#E8C97A', borderRadius: 999, padding: '9px 16px', fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FiUsers /> My Weddings
            </button>
          ) : (
            <button onClick={() => navigate('/login')} style={{ border: 'none', background: '#6B1E3A', color: '#E8C97A', borderRadius: 999, padding: '9px 16px', fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FiLogIn /> Sign In
            </button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '26px 18px 48px' }}>
        <section
          style={{
            borderRadius: 24,
            padding: '30px 24px',
            background: 'linear-gradient(135deg, #6B1E3A 0%, #3f1222 52%, #6B1E3A 100%)',
            color: '#F8EDD7',
            boxShadow: '0 18px 38px rgba(58, 14, 30, 0.28)',
            marginBottom: 22,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div style={{ position: 'absolute', right: -120, top: -90, width: 260, height: 260, borderRadius: '50%', background: 'rgba(232,201,122,0.15)' }} />
          <div style={{ position: 'relative', maxWidth: 800 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, color: 'rgba(232,201,122,0.85)' }}>
              Luxury Wedding Planning, now data-driven
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(34px, 5vw, 54px)', lineHeight: 1.02, marginBottom: 12 }}>
              Plan smarter budgets for Indian weddings with real intelligence.
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: 'rgba(248,237,215,0.9)', maxWidth: 760 }}>
              WeddingBudget.ai turns planner intuition into an AI-assisted estimate engine with city-aware ranges,
              decor intelligence, and itemized cost visibility.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/app')} style={{ background: '#E8C97A', color: '#3f1222', border: 'none', borderRadius: 9, padding: '11px 16px', fontWeight: 800, fontSize: 13 }}>
                Start Estimating
              </button>
              <a href="https://www.instagram.com/eventsbyathea/" target="_blank" rel="noreferrer" style={{ background: 'transparent', color: '#E8C97A', border: '1px solid rgba(232,201,122,0.5)', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <FiExternalLink /> Events By Athea
              </a>
            </div>
          </div>
        </section>

        <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {TABS.map((tab) => (
            <TabButton key={tab.id} active={activeTab === tab.id} icon={tab.icon} label={tab.label} onClick={() => setActiveTab(tab.id)} />
          ))}
        </section>

        <section style={{ background: '#fff', border: '1px solid #e4d6c0', borderRadius: 18, padding: '22px 18px', boxShadow: '0 6px 24px rgba(89,35,50,0.08)' }}>
          {activeTab === 'problem' && (
            <div>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, marginBottom: 8, color: '#2D1520' }}>Problem Statement</h2>
              <p style={{ color: '#5a3543', lineHeight: 1.8, fontSize: 15 }}>
                Wedding budget planning in India is an art passed down through experience. Planners rely on gut feel and
                memory from past projects to estimate budgets. There is no data-driven tool that can intelligently
                estimate a wedding budget based on city, hotel category, number of rooms, decor style, guest count,
                and service requirements.
              </p>
              <p style={{ color: '#5a3543', lineHeight: 1.8, fontSize: 15, marginTop: 12 }}>
                The challenge is to build WeddingBudget.ai, an AI-powered budget estimation engine that scrapes
                real-world design references, maps artist and logistics costs, and delivers a client-facing budget
                estimate with intelligent ranges and itemized breakdowns.
              </p>
            </div>
          )}

          {activeTab === 'about' && (
            <div>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, marginBottom: 8, color: '#2D1520' }}>About Events By Athea</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 14 }}>
                {[
                  { k: 'Company', v: 'Events By Athea' },
                  { k: 'Category', v: 'Event Planner' },
                  { k: 'Speciality', v: 'Bespoke Wedding Designers and Luxury Events' },
                  { k: 'Founder', v: '@shubhiagrawal08' },
                  { k: 'Recognition', v: 'ET Panache Women of the Year' },
                ].map((item) => (
                  <div key={item.k} style={{ border: '1px solid #ecdcc4', borderRadius: 12, padding: '12px 14px', background: '#fffdf9' }}>
                    <div style={{ fontSize: 11, color: '#7A5563', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{item.k}</div>
                    <div style={{ fontWeight: 700, color: '#3f1222' }}>{item.v}</div>
                  </div>
                ))}
              </div>
              <a href="https://www.instagram.com/eventsbyathea/" target="_blank" rel="noreferrer" style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#6B1E3A', fontWeight: 700 }}>
                <FiMapPin /> Visit Instagram Profile
              </a>
            </div>
          )}

          {activeTab === 'games' && (
            <div>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, marginBottom: 8, color: '#2D1520' }}>Fun Wedding Games</h2>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {games.map((game, i) => (
                  <article key={game.title} style={{ border: '1px solid #ecdcc4', borderRadius: 12, padding: '12px 14px', background: i % 2 === 0 ? '#fffdf9' : '#fff' }}>
                    <div style={{ fontWeight: 800, color: '#6B1E3A', marginBottom: 4 }}>{game.title}</div>
                    <div style={{ color: '#5a3543', fontSize: 14, lineHeight: 1.6 }}>{game.desc}</div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'cards' && (
            <div onWheel={handleWheel}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, marginBottom: 8, color: '#2D1520' }}>Wedding Card Designs</h2>
              <p style={{ color: '#5a3543', lineHeight: 1.7, fontSize: 14, marginBottom: 14 }}>
                Use arrows or scroll over the slider to browse. Click a design to open and customize it on Canva.
              </p>

              <div style={{ position: 'relative' }}>
                <div style={{ overflow: 'hidden', borderRadius: 14, border: '1px solid #ead7be', background: '#f8efe1' }}>
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
                        <a href={card.canvaUrl} target="_blank" rel="noreferrer" title="Open design in Canva" style={{ display: 'block' }}>
                          <img
                            src={card.imageUrl}
                            alt={`Wedding card design ${i + 1}`}
                            style={{ width: '100%', height: 'clamp(230px, 48vw, 500px)', objectFit: 'cover', borderRadius: 12, boxShadow: '0 10px 25px rgba(33,13,22,0.24)' }}
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
    </div>
  );
}
