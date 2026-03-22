import React, { useEffect, useState } from 'react';
import { getToken } from '../lib/tokenStore.js';
import { fetchFromApi } from '../lib/apiBase.js';
import { FiImage, FiPlus, FiSave, FiTrash2 } from 'react-icons/fi';

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetchFromApi(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function Input({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '9px 11px',
        border: '1px solid #e0d5c5',
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "'Jost',sans-serif",
      }}
    />
  );
}

export default function AdminWebsiteContent() {
  const [cards, setCards] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    apiFetch('/api/admin/website-content')
      .then((data) => {
        if (!mounted) return;
        setCards(data.content?.cards ?? []);
        setGames(data.content?.games ?? []);
      })
      .catch((e) => {
        if (!mounted) return;
        setMsg(`Error: ${e.message}`);
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  function updateCard(i, key, value) {
    setCards((prev) => prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  function updateGame(i, key, value) {
    setGames((prev) => prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const payload = {
        cards: cards
          .map((c) => ({ imageUrl: (c.imageUrl || '').trim(), canvaUrl: (c.canvaUrl || '').trim() }))
          .filter((c) => c.imageUrl && c.canvaUrl),
        games: games
          .map((g) => ({ title: (g.title || '').trim(), desc: (g.desc || '').trim(), imageUrl: (g.imageUrl || '').trim() }))
          .filter((g) => g.title && g.desc && g.imageUrl),
      };
      const data = await apiFetch('/api/admin/website-content', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setCards(data.content?.cards ?? payload.cards);
      setGames(data.content?.games ?? payload.games);
      setMsg('Saved website content successfully.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ color: '#888', fontSize: 13 }}>Loading website content…</div>;
  }

  return (
    <div style={{ fontFamily: "'Jost',sans-serif" }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, margin: 0, color: '#1a0a0a' }}>
        <FiImage style={{ verticalAlign: 'middle', marginRight: 8 }} />Website Content
      </h1>
      <p style={{ color: '#888', fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        Manage homepage wedding card designs and fun wedding games.
      </p>

      {msg && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            borderRadius: 8,
            border: msg.startsWith('Error:') ? '1px solid rgba(220,38,38,0.28)' : '1px solid rgba(21,128,61,0.25)',
            background: msg.startsWith('Error:') ? 'rgba(220,38,38,0.08)' : 'rgba(21,128,61,0.08)',
            color: msg.startsWith('Error:') ? '#dc2626' : '#15803d',
            fontSize: 12,
          }}
        >
          {msg}
        </div>
      )}

      <section style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: '#1a0a0a' }}>Wedding Card Designs</div>
          <button
            onClick={() => setCards((prev) => [...prev, { imageUrl: '', canvaUrl: '' }])}
            style={{
              padding: '7px 12px',
              border: '1px solid #e0d5c5',
              background: '#fff',
              borderRadius: 7,
              fontSize: 12,
              color: '#7a1c1c',
              fontWeight: 700,
            }}
          >
            <FiPlus style={{ verticalAlign: 'middle' }} /> Add Card
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {cards.map((card, i) => (
            <div key={i} style={{ border: '1px solid #f0e8e0', borderRadius: 10, padding: 10, background: '#fffdf9' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'center' }}>
                <Input value={card.imageUrl || ''} onChange={(e) => updateCard(i, 'imageUrl', e.target.value)} placeholder="Image URL (e.g. /cards/card-1.webp or https://...)" />
                <Input value={card.canvaUrl || ''} onChange={(e) => updateCard(i, 'canvaUrl', e.target.value)} placeholder="Canva customization link" />
                <button
                  onClick={() => setCards((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{
                    border: '1px solid #f3c8c8',
                    background: '#fff',
                    borderRadius: 7,
                    color: '#dc2626',
                    width: 34,
                    height: 34,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <FiTrash2 />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: '#1a0a0a' }}>Fun Wedding Games</div>
          <button
            onClick={() => setGames((prev) => [...prev, { title: '', desc: '', imageUrl: '' }])}
            style={{
              padding: '7px 12px',
              border: '1px solid #e0d5c5',
              background: '#fff',
              borderRadius: 7,
              fontSize: 12,
              color: '#7a1c1c',
              fontWeight: 700,
            }}
          >
            <FiPlus style={{ verticalAlign: 'middle' }} /> Add Game
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {games.map((game, i) => (
            <div key={i} style={{ border: '1px solid #f0e8e0', borderRadius: 10, padding: 10, background: '#fffdf9' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1.4fr auto', gap: 10, alignItems: 'center' }}>
                <Input value={game.title || ''} onChange={(e) => updateGame(i, 'title', e.target.value)} placeholder="Game title" />
                <Input value={game.desc || ''} onChange={(e) => updateGame(i, 'desc', e.target.value)} placeholder="Game description" />
                <Input value={game.imageUrl || ''} onChange={(e) => updateGame(i, 'imageUrl', e.target.value)} placeholder="Image URL (e.g. /games/game-1.jpg)" />
                <button
                  onClick={() => setGames((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{
                    border: '1px solid #f3c8c8',
                    background: '#fff',
                    borderRadius: 7,
                    color: '#dc2626',
                    width: 34,
                    height: 34,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <FiTrash2 />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '10px 16px',
          border: 'none',
          background: '#7a1c1c',
          color: '#E8C97A',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <FiSave style={{ verticalAlign: 'middle', marginRight: 6 }} />
        {saving ? 'Saving…' : 'Save Website Content'}
      </button>
    </div>
  );
}
