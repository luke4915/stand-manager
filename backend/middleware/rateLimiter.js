import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { VERIFY_OPTIONS } from '../utils/jwtConfig.js';

// Chiave del limite: l'utente, se la richiesta ha una sessione valida; altrimenti l'IP.
// Le casse di una sagra escono spesso dallo stesso IP pubblico: contando per IP
// si dividerebbero un unico limite. Il token è verificato, non solo letto, così
// un cookie inventato non apre un limite nuovo.
function userOrIpKey(req) {
  const token = req.cookies?.token;
  if (token) {
    try {
      const { tenantId, id } = jwt.verify(token, process.env.JWT_SECRET, VERIFY_OPTIONS);
      return `utente:${tenantId}:${id}`;
    } catch { /* token non valido o scaduto: si conta per IP */ }
  }
  return ipKeyGenerator(req.ip);
}

const limiter = (options) => rateLimit({ standardHeaders: true, legacyHeaders: false, ...options });

// Login: max 10 tentativi falliti per coppia IP + nome utente ogni 15 minuti, così chi sbaglia
// la password non blocca gli altri della stessa sagra (stesso IP) e un account noto non si attacca a oltranza.
// In più un tetto largo per IP, contro chi prova nomi utente diversi.
const loginMessage = { error: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' };
export const loginLimiter = [
  limiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.username ?? '').trim().toLowerCase().slice(0, 50)}`,
    message: loginMessage,
  }),
  limiter({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: loginMessage,
  }),
];

// Esportazioni: costose, poche per utente
export const exportsLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: userOrIpKey,
  message: { error: 'Troppe esportazioni, riprova tra un minuto.' },
});

// API generali: max 300 richieste al minuto per utente (o per IP senza sessione)
export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: userOrIpKey,
  message: { error: 'Troppe richieste in poco tempo, riprova tra un minuto.' },
});

// Ordini: max 120 al minuto per utente. Basta anche a svuotare una coda offline:
// se si supera, la coda si ferma e riprova dopo (429 è un errore temporaneo).
export const ordersLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: userOrIpKey,
  message: { error: 'Troppi ordini in poco tempo, riprova tra un minuto.' },
});

// Dispositivi: l'abbinamento avviene una volta per cassa. Il limite protegge dall'esaurire le 26 lettere,
// ma lascia spazio al recupero dello stato (GET) di molte casse che ripartono insieme.
export const devicesLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: userOrIpKey,
  message: { error: 'Troppe richieste sui dispositivi, riprova più tardi.' },
});
