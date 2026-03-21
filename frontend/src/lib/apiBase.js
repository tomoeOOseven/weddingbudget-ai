const configuredBase = (import.meta.env.VITE_API_URL || '').trim();

const isLocalHost = typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

const fallbackBases = isLocalHost
  ? ['http://localhost:4000']
  : [
      'https://weddingbudget-backend-k29m.onrender.com',
      'https://weddingbudget-backend.onrender.com',
    ];

export const API_BASES = [...new Set([configuredBase, ...fallbackBases].filter(Boolean))];

export async function fetchFromApi(path, options = {}) {
  let lastError = null;

  for (const base of API_BASES) {
    try {
      const response = await fetch(`${base}${path}`, options);

      if (response.status >= 500 && API_BASES.length > 1) {
        lastError = new Error(`Server unavailable at ${base}: ${response.status}`);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('All API backends are unavailable.');
}
