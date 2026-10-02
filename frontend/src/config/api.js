// URL di API/WebSocket calcolati dal sottodominio corrente, non fissi in .env.
// Così "default.standmanager.local" e "prova.standmanager.local" (o qualsiasi
// tenant futuro) chiamano automaticamente il backend giusto senza rebuild.
const { protocol, hostname } = window.location;
const isSecure = protocol === 'https:';

export const API_URL = `${isSecure ? 'https' : 'http'}://${hostname}:3000/api`;
export const WS_URL = `${isSecure ? 'wss' : 'ws'}://${hostname}:3000`;

// Codici con cui il server chiude il WebSocket (vedi backend/ws.js).
// 4401: token mancante o scaduto → rinnovare la sessione prima di riconnettersi.
export const WS_CLOSE_UNAUTHORIZED = 4401;
