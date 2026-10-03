// URL di API e WebSocket ricavati dall'indirizzo corrente, non fissi: ogni tenant
// ha il suo sottodominio ("default.standmanager.local", "prova.standmanager.local"…)
// e chiama automaticamente il backend giusto, senza rebuild.
// In sviluppo Vite gira sulla 5173 e il backend sulla 3000; in produzione il frontend
// è servito dal backend stesso (o da un reverse proxy), quindi stessa origine.
const { protocol, hostname, host } = window.location;
const apiHost = import.meta.env.DEV ? `${hostname}:3000` : host;

export const API_URL = `${protocol}//${apiHost}/api`;
export const WS_URL = `${protocol === 'https:' ? 'wss' : 'ws'}://${apiHost}`;

// Codici con cui il server chiude il WebSocket (vedi backend/ws.js).
// 4401: token mancante o scaduto → rinnovare la sessione prima di riconnettersi.
export const WS_CLOSE_UNAUTHORIZED = 4401;
