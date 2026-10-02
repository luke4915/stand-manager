import jwt from 'jsonwebtoken';
import logger from '../logger.js';

export function authenticate(req, res, next) {
  let token = req.cookies?.token;
  if (!token) {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (auth?.startsWith('Bearer ')) token = auth.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'Token mancante' });

  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET non impostata');
    return res.status(500).json({ error: 'Server non configurato correttamente' });
  }

  try {
    const { id, username, role, tenantId, tenantName } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id, username, role, tenantId, tenantName };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token scaduto', code: 'TOKEN_EXPIRED' });
    return res.status(403).json({ error: 'Token non valido' });
  }
}

export function authorizeAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
  next();
}

// Ruoli abilitati ad applicare sconti/omaggi su ordini e singoli prodotti.
// Esportato anche come array riutilizzabile per validazioni inline (non solo middleware di route).
export const DISCOUNT_ROLES = ['admin', 'responsabile'];

export function authorizeDiscount(req, res, next) {
  if (!DISCOUNT_ROLES.includes(req.user?.role))
    return res.status(403).json({ error: 'Accesso riservato ad admin e responsabili' });
  next();
}