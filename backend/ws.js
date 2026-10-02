import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import logger from './logger.js';
import { isAllowedOrigin } from './utils/origins.js';
import { toPublicOrder } from './utils/publicOrder.js';
import { extractSlug, findTenantBySlug } from './middleware/resolveTenantFromHost.js';
import { checkTenantAccess } from './middleware/tenantScope.js';

// Codici di chiusura applicativi (range 4000-4999 riservato alle applicazioni).
// 4401: token mancante, scaduto o non valido → il client fa refresh e si riconnette.
// 4403: tenant non coerente, disattivato o con licenza scaduta.
export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_FORBIDDEN = 4403;

const HEARTBEAT_MS = 30 * 1000;

// Eventi che arrivano anche al KDS pubblico, già ridotti ai soli dati per la cucina.
const PUBLIC_EVENTS = {
  order_created: (msg) => ({ type: msg.type, order: toPublicOrder(msg.order) }),
  order_updated: (msg) => ({ type: msg.type, order: toPublicOrder(msg.order) }),
  session_ended: (msg) => ({ type: msg.type }),
};

function readCookie(header, name) {
  for (const part of (header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function rejectUpgrade(socket, status, message) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

// Decide chi è il client prima di accettare la connessione.
// - Staff (cassa, cucina, admin): cookie JWT, tenant preso dal token e verificato sul sottodominio.
// - KDS pubblico (?kds=public): nessun login, tenant ricavato dal sottodominio.
// Ritorna { reject: [status, message] } per rifiutare l'handshake,
// { closeCode, reason } per accettare e chiudere subito (così il browser vede il codice),
// oppure il contesto del client.
async function authorizeUpgrade(req) {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) return { reject: [403, 'Forbidden'] };

  const hostname = (req.headers.host || '').replace(/:\d+$/, '');
  const slug = extractSlug(hostname);
  const tenant = slug ? await findTenantBySlug(slug) : null;
  if (!tenant) return { reject: [404, 'Not Found'] };
  if (!tenant.active) return { reject: [403, 'Forbidden'] };

  const isPublic = new URL(req.url, 'http://localhost').searchParams.get('kds') === 'public';
  if (isPublic) return { audience: 'public', tenantId: tenant.tenantId };

  const token = readCookie(req.headers.cookie, 'token');
  if (!token) return { closeCode: WS_CLOSE_UNAUTHORIZED, reason: 'Token mancante' };

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { closeCode: WS_CLOSE_UNAUTHORIZED, reason: 'Token non valido o scaduto' };
  }
  if (decoded.tenantId !== tenant.tenantId) {
    return { closeCode: WS_CLOSE_FORBIDDEN, reason: 'Tenant non corrispondente' };
  }
  const denied = await checkTenantAccess(decoded.tenantId);
  if (denied) return { closeCode: WS_CLOSE_FORBIDDEN, reason: denied.error };

  return {
    audience: 'staff',
    tenantId: decoded.tenantId,
    userId: decoded.id,
    expiresAt: decoded.exp * 1000,
  };
}

// Aggancia il server WebSocket al server HTTPS e restituisce broadcast/close.
// Ogni client appartiene a un solo tenant: broadcast(tenantId, msg) non esce mai da lì.
export function attachWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', (err) => logger.warn({ err }, 'WS: errore socket durante handshake'));
    let ctx;
    try {
      ctx = await authorizeUpgrade(req);
    } catch (err) {
      logger.error({ err }, 'WS: errore durante la verifica della connessione');
      return rejectUpgrade(socket, 500, 'Internal Server Error');
    }
    if (ctx.reject) return rejectUpgrade(socket, ...ctx.reject);

    wss.handleUpgrade(req, socket, head, (ws) => {
      if (ctx.closeCode) return ws.close(ctx.closeCode, ctx.reason);

      ws.tenantId = ctx.tenantId;
      ws.audience = ctx.audience;
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('error', (err) => logger.error({ err }, 'WS: errore client'));

      // Il token ha una scadenza: alla scadenza chiudiamo, il client rinnova e si riconnette.
      if (ctx.expiresAt) {
        const timer = setTimeout(
          () => ws.close(WS_CLOSE_UNAUTHORIZED, 'Token scaduto'),
          Math.max(0, ctx.expiresAt - Date.now())
        );
        ws.on('close', () => clearTimeout(timer));
      }

      logger.info({ tenantId: ctx.tenantId, audience: ctx.audience, userId: ctx.userId }, 'WS: client connesso');
      ws.send(JSON.stringify({ type: 'connected' }));
    });
  });

  // Chiude le connessioni morte (Wi-Fi caduto, tablet in standby) che non rispondono al ping.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);

  function broadcast(tenantId, msg) {
    if (!tenantId) {
      logger.error({ type: msg?.type }, 'WS: broadcast senza tenantId, evento scartato');
      return;
    }
    const staffPayload = JSON.stringify(msg);
    const toPublic = PUBLIC_EVENTS[msg.type];
    let publicPayload = null;

    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN || client.tenantId !== tenantId) continue;
      if (client.audience === 'staff') {
        client.send(staffPayload);
      } else if (toPublic) {
        publicPayload ??= JSON.stringify(toPublic(msg));
        client.send(publicPayload);
      }
    }
  }

  function close() {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }

  return { broadcast, close };
}
