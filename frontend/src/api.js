// api.js — all backend calls, auth-aware
import { getToken } from './lib/tokenStore.js';
import { fetchFromApi } from './lib/apiBase.js';

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetchFromApi(path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const fetchReferenceData  = () => request('/api/data/all');
export const calculateEstimate   = (inputs) => request('/api/estimate', {
  method: 'POST',
  body: JSON.stringify({
    ...inputs,
    functions:         [...inputs.functions],
    selectedDecors:    [...inputs.selectedDecors],
    selectedArtists:   [...inputs.selectedArtists],
    selectedMeals:     [...inputs.selectedMeals],
    specialtyCounters: [...inputs.specialtyCounters],
    sfx:               [...inputs.sfx],
  }),
});
export const quickEstimate       = (inputs) => request('/api/estimate/quick', { method:'POST', body: JSON.stringify(inputs) });
export const fetchDecor          = (p = {}) => request(`/api/decor?${new URLSearchParams(p)}`);
export const fetchScrapedDecor   = (p = {}) => request(`/api/decor/scraped?${new URLSearchParams(p)}`);
export const scoreDecor          = (selections, city, hotelTier) => request('/api/decor/score', { method:'POST', body: JSON.stringify({ selections, city, hotelTier }) });
export const fetchArtists        = (type) => request(`/api/artists${type ? `?type=${type}` : ''}`);
export const estimateFB          = (payload) => request('/api/fb/estimate', { method:'POST', body: JSON.stringify(payload) });
export const estimateLogistics   = (payload) => request('/api/logistics/estimate', { method:'POST', body: JSON.stringify(payload) });
export const fetchWeddings       = () => request('/api/weddings');
export const createWedding       = (data) => request('/api/weddings', { method:'POST', body: JSON.stringify(data) });
export const fetchWedding        = (id) => request(`/api/weddings/${id}`);
export const updateWedding       = (id, data) => request(`/api/weddings/${id}`, { method:'PUT', body: JSON.stringify(data) });
export const fetchWeddingState   = (id) => request(`/api/weddings/${id}/state`);
export const updateWeddingState  = (id, data) => request(`/api/weddings/${id}/state`, { method:'PUT', body: JSON.stringify(data) });
export const deleteWedding       = (id) => request(`/api/weddings/${id}`, { method:'DELETE' });
export const fetchActuals        = (wid) => request(`/api/report/actuals/${wid}`);
export const addActual           = (data) => request('/api/report/actuals', { method:'POST', body: JSON.stringify(data) });
export const updateActual        = (id, data) => request(`/api/report/actuals/${id}`, { method:'PUT', body: JSON.stringify(data) });
export const deleteActual        = (id) => request(`/api/report/actuals/${id}`, { method:'DELETE' });
export const fetchScenarios      = (wid) => request(`/api/report/scenarios/${wid}`);
export const saveScenario        = (data) => request('/api/report/scenarios', { method:'POST', body: JSON.stringify(data) });
export const deleteScenario      = (id) => request(`/api/report/scenarios/${id}`, { method:'DELETE' });
export const fetchHomepageContent = () => request('/api/content/homepage');
export const updateHomepageContent = (data) => request('/api/admin/website-content', { method:'PUT', body: JSON.stringify(data) });

export const downloadPDF = async (payload) => {
  const token = getToken();
  const res = await fetchFromApi('/api/report/pdf', {
    method:'POST',
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'PDF generation failed' }));
    throw new Error(err.error || 'PDF generation failed');
  }
  const contentType = res.headers.get('content-type') || '';
  const blob = await res.blob();
  return { blob, contentType };
};

export const downloadXLSX = async (payload) => {
  const token = getToken();
  const res = await fetchFromApi('/api/report/xlsx', {
    method:'POST',
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Excel generation failed');
  return res.blob();
};