// tokenStore.js — single source of truth for the current access token.
// AuthContext is the only writer. api.js and any local apiFetch read from here,
// avoiding concurrent supabase.auth.getSession() calls that trigger the
// "Lock broken by another request with the 'steal' option" error.

let _token = null;

export function setToken(token) { _token = token; }
export function getToken()      { return _token;  }
