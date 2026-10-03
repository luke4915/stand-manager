import { API_URL } from '../config/api';

// Client unico per le chiamate al backend.
//
// apiFetch(path, options)       chiamata semplice: login, pagine pubbliche, master panel.
// fetchWithAuth(path, options)  come apiFetch, ma su 401 rinnova la sessione una volta
//                               e ripete la richiesta; usata da tutte le schermate autenticate.
//
// options: come fetch, più
//   body  oggetto → inviato come JSON (FormData, Blob e stringhe passano così come sono)
//   raw   true → restituisce la Response (file, audio) invece del JSON
//
// Esito: il JSON della risposta (null se vuota). In caso di problemi lancia
//   ApiError      il server ha risposto con un errore: message in italiano, status, code
//   NetworkError  il server non è raggiungibile (rete assente): l'ordine può andare in coda

export class ApiError extends Error {
  constructor(status, message, code, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export class NetworkError extends Error {
  constructor(cause) {
    super('Server non raggiungibile: controlla la connessione');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && value.constructor === Object;

export async function apiFetch(path, { body, raw = false, headers, ...init } = {}) {
  const jsonBody = isPlainObject(body) || Array.isArray(body);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers: jsonBody ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: jsonBody ? JSON.stringify(body) : body,
    });
  } catch (err) {
    throw new NetworkError(err);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || `Errore del server (${res.status})`, data.code, data);
  }
  if (raw) return res;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ─── Sessione ─────────────────────────────────────────────────────────
// AuthProvider registra qui le sue azioni all'avvio (setAuthHandlers), così il
// client non dipende da React e lo usano allo stesso modo componenti e coda offline.
//   refresh()          rinnova il cookie; false = sessione persa (AuthProvider fa già il logout)
//   onAccessDenied()   licenza scaduta o tenant disattivato: si esce dall'app
let authHandlers = { refresh: async () => false, onAccessDenied: () => {} };

export function setAuthHandlers(handlers) {
  authHandlers = handlers;
}

// Più chiamate che scadono insieme condividono un solo rinnovo.
let pendingRefresh = null;
function refreshOnce() {
  pendingRefresh ??= authHandlers.refresh().finally(() => { pendingRefresh = null; });
  return pendingRefresh;
}

const ACCESS_DENIED_CODES = ['LICENSE_EXPIRED', 'TENANT_INACTIVE'];

export async function fetchWithAuth(path, options) {
  try {
    return await apiFetch(path, options);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (ACCESS_DENIED_CODES.includes(err.code)) authHandlers.onAccessDenied(err);
    if (err.status !== 401 || !(await refreshOnce())) throw err;
    return apiFetch(path, options);
  }
}
